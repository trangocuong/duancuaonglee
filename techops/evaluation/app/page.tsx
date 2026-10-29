"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ChangeEvent, ClipboardEvent, DragEvent, FormEvent } from "react";
import { applyLanguage, translateDynamic } from "./i18n";
import type { Language } from "./i18n";
import { parseEvaluationWorkbook, parseSeeLotForManual, parseSeeLotTableForManual } from "./lib/excel-import";
import type { SeeLotManualPrefill, WorkbookImport } from "./lib/excel-import";
import { buildEvaluationReport, evaluationReportTitle } from "./lib/excel-report";
import { buildMassReportExcel } from "./lib/mass-report-excel";
import { lookupPartNumber } from "./lib/part-number-map";

type View = "overview" | "list" | "new-product" | "mass-report" | "history" | "reports" | "users";
type Evaluation = {
  id: number;
  evaluationNo: string;
  evaluationType: string;
  evaluationContent: string;
  lotNo: string;
  product: string;
  formFactor: string;
  density: string;
  partNo: string;
  quantity: number;
  equipment: string;
  step: string;
  owner: string;
  startDate: string;
  targetDate: string;
  status: string;
  approvalStatus: string;
  result: string;
  progress: number;
  failQty: number;
  yieldRate: number;
  note: string;
  createdAt: string;
  updatedAt: string;
  currentStep?: string;
  timelines?: TimelineItem[];
};
type History = {
  id: number;
  evaluationId: number | null;
  action: string;
  lotNo: string;
  evaluationType: string;
  detail: string;
  actor: string;
  createdAt: string;
};
type TimelineItem = {
  id: number;
  evaluationId: number;
  sequence: number;
  stage: string;
  eventDate: string;
  status: string;
  note: string;
  createdAt: string;
};
type AppUser = {
  id: number;
  email: string;
  username: string | null;
  displayName: string;
  department: string;
  requestNote: string;
  role: "admin" | "editor" | "viewer";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};
type Me = {
  identity: { email: string; fullName: string };
  user: AppUser | null;
};
type Draft = Omit<Evaluation, "id" | "createdAt" | "updatedAt">;
type RdtData = {
  total: string;
  pass: string;
  fail: string;
  tcQty: string;
  tcTestResult: string;
  tc50: string;
  tc300: string;
  tc600: string;
  humidityQty: string;
  humidityResult: string;
  humidity120: string;
  humidity320: string;
  shipQty: string;
  mechanical: string;
  shippingDate: string;
};
type ManualStage = {
  id?: number;
  stage: string;
  equipment: string;
  trackIn: string;
  trackOut: string;
  inputQty: string;
  outputQty: string;
  failCode: string;
  reason: string;
  rdt?: RdtData;
  originalNote?: string;
};
type SplitLot = {
  lotId: string;
  equipment: string;
  trackIn: string;
  trackOut: string;
  inputQty: string;
  outputQty: string;
  failCode: string;
  stages: Record<string, Omit<SplitLot, "lotId" | "stages">>;
};
type ManualDraft = {
  evaluationId: number | null;
  evaluationNo: string;
  product: string;
  formFactor: string;
  density: string;
  evaluationType: string;
  classification: string;
  partNo: string;
  smtLot: string;
  lane: string;
  quantity: number;
  planDateIn: string;
  lotCurrent: string;
  status: string;
  statusReason: string;
  approvalStatus: string;
  stages: ManualStage[];
  splitLots: SplitLot[];
};
type MassStage = { equipment: string; trackIn: string; trackOut: string; input: number; output: number; scrap: string; fail: number; yield: number };
type MassLot = { partNo: string; lotNo: string; quantity: number; lane: string; status: string; rawText: string; stages: Record<string, MassStage> };
type MassReport = {
  id: number; evaluationNo: string; evaluationType: string; classification: string; product: string; formFactor: string;
  startStep: string; partId: string; density: string; lane: string; quantity: number; status: string; reason: string; lots: MassLot[]; createdAt: string; updatedAt: string;
};
type MassDraft = Omit<MassReport, "id" | "createdAt" | "updatedAt" | "quantity"> & { id: number | null };
const defaultManualStages = [
  "SMT (M010/M015)",
  "Soldering (M026)",
  "iARTs (M031)",
  "Router (M033)",
  "M045",
  "Casing (M087/M120)",
  "Aging (M100/M111)",
  "LED Test (M125)",
  "Interface (M130)",
  "AVI (M160)",
  "FVI (M164)",
  "Basic (M165)",
  "Packing (M170)",
];
const evaluationTypes = ["DOE", "PFQ", "PRQ", "FQ", "1K", "2K", "5K", "10K", "PGM", "EQP", "Product Expansion"];
const overviewEvaluationTypes = ["DOE", "PFQ", "PRQ", "FQ", "1K", "2K", "10K"];
const formFactorOptions = ['2.5"', "M.2", "U.2", "E1.S"];
const approvalOptions = ["Đã phê duyệt", "Chưa phê duyệt", "Chờ phê duyệt"];
const laneOptions = ["SM-SA", "SM-SB", "SM-SC", "SM-SD", "SM-SE", "SM-SF", "SM-SG"];
const stepOptions = [...defaultManualStages, "RDT Test"];
const massEvaluationTypes = ["1K", "2K", "5K", "10K"];
const seeUpdateHeaders = ["EVENT_NAME", "DATE/TIME", "QTY", "STEP", "EQP", "LINE", "OPERID", "CHG_ITEM", "CHG_VALS", "QTY", "COMMENT"];
const emptySeeUpdateRows = () => Array.from({ length: 18 }, () => Array.from({ length: seeUpdateHeaders.length }, () => ""));
const emptyMassLot = (): MassLot => ({ partNo: "", lotNo: "", quantity: 0, lane: "", status: "", rawText: "", stages: {} });
const createMassDraft = (): MassDraft => ({ id: null, evaluationNo: "", evaluationType: "1K", classification: "", product: "", formFactor: "", startStep: defaultManualStages[0], partId: "", density: "", lane: "", status: "Chờ thực hiện", reason: "", lots: Array.from({ length: 14 }, emptyMassLot) });
const emptyRdtData = (): RdtData => ({
  total: "", pass: "", fail: "", tcQty: "22", tcTestResult: "", tc50: "", tc300: "", tc600: "",
  humidityQty: "45", humidityResult: "", humidity120: "", humidity320: "",
  shipQty: "10", mechanical: "", shippingDate: "",
});
const emptyManualStage = (stage: string): ManualStage => ({
  stage, equipment: "", trackIn: "", trackOut: "", inputQty: "", outputQty: "", failCode: "", reason: "",
  ...(stage === "RDT Test" ? { rdt: emptyRdtData() } : {}),
});
const stagesForEvaluationType = (evaluationType: string) => {
  if (evaluationType.trim().toUpperCase() === "PRQ") {
    const agingIndex = defaultManualStages.findIndex((stage) => /M100|M111|AGING/i.test(stage));
    return [...defaultManualStages.slice(0, agingIndex + 1), "RDT Test"];
  }
  return defaultManualStages;
};
const codeRange = (prefix: string, start: number, end: number, width = 3) =>
  Array.from({ length: end - start + 1 }, (_item, index) => `${prefix}${String(start + index).padStart(width, "0")}`);
const stageHasEquipment = (stage: string) => !/SMT|M010|M015|SOLDER|M026|M045|FVI|M164|BASIC|M165|PACK|M170/i.test(stage);
const equipmentOptions = (stage: string) => {
  if (/IARTS|M031|ARTS/i.test(stage)) return codeRange("H", 101, 901, 3).filter((code) => Number(code.slice(1)) % 100 === 1).map((code) => `${code}-LD`);
  if (/ROUTER|M033/i.test(stage)) return codeRange("SRT-", 1, 8);
  if (/CASING|M087|M120/i.test(stage)) return ["CA-H901", "CA-H903", "CM-H901", "CS-H901", "CS-H902", "CS-H903", "CS-H904"];
  if (/AGING|M100|M111/i.test(stage)) return [...codeRange("AT-H", 701, 711), ...codeRange("AT-H", 901, 907)];
  if (/INTERFACE|M130/i.test(stage)) return codeRange("AI-H", 901, 913);
  if (/AVI|M160/i.test(stage)) return codeRange("AVI-", 1, 7, 2);
  return [];
};
const createManualDraft = (): ManualDraft => ({
  evaluationId: null,
  evaluationNo: "",
  product: "",
  formFactor: "",
  density: "",
  evaluationType: "DOE",
  classification: "",
  partNo: "",
  smtLot: "",
  lane: "",
  quantity: 0,
  planDateIn: "",
  lotCurrent: "",
  status: "Chờ thực hiện",
  statusReason: "",
  approvalStatus: "Chưa phê duyệt",
  stages: defaultManualStages.map(emptyManualStage),
  splitLots: [],
});
const emptyDraft: Draft = {
  evaluationNo: "",
  evaluationType: "DOE",
  evaluationContent: "",
  lotNo: "",
  product: "",
  formFactor: "",
  density: "",
  partNo: "",
  quantity: 0,
  equipment: "",
  step: "",
  owner: "",
  startDate: "",
  targetDate: "",
  status: "Chờ thực hiện",
  approvalStatus: "Chưa phê duyệt",
  result: "-",
  progress: 0,
  failQty: 0,
  yieldRate: 0,
  note: "",
};
const colors: Record<string, string> = {
  DOE: "violet",
  PFQ: "blue",
  PRQ: "orange",
  FQ: "teal",
  "1K": "blue",
  "2K": "blue",
  "10K": "violet",
  PGM: "orange",
  EQP: "teal",
  Expansion: "violet",
  "EQP Expansion": "teal",
  "Product Expansion": "violet",
};
const nav = [
  { id: "overview" as View, icon: "▦", label: "Tổng quan" },
  { id: "list" as View, icon: "◫", label: "Danh sách đánh giá" },
  { id: "new-product" as View, icon: "▤", label: "Đánh giá sản phẩm mới" },
  { id: "mass-report" as View, icon: "▥", label: "Update báo cáo 1K · 2K · 10K" },
  { id: "history" as View, icon: "↻", label: "Lịch sử cập nhật" },
  { id: "reports" as View, icon: "◎", label: "Báo cáo & Thống kê" },
  { id: "users" as View, icon: "♙", label: "Quản lý tài khoản" },
];
const headings = {
  overview: [
    "Tổng quan tiến độ",
    "Dữ liệu Lot, timeline và kết quả được tổng hợp tự động từ Excel.",
  ],
  list: [
    "Danh sách đánh giá",
    "Đồng bộ DOE, PFQ, PRQ và FQ bằng file Excel mẫu.",
  ],
  "new-product": [
    "TỔNG QUAN ĐÁNH GIÁ SẢN PHẨM MỚI",
    "Theo dõi chuỗi DOE → PFQ → PRQ → FQ → 1K → 2K → 10K theo từng No.",
  ],
  "mass-report": [
    "Update báo cáo 1K · 2K · 5K · 10K",
    "Dán lịch sử Lot và tự động tổng hợp dữ liệu theo từng công đoạn.",
  ],
  history: [
    "Lịch sử cập nhật",
    "Theo dõi các lần nhập Excel và thay đổi dữ liệu Lot.",
  ],
  reports: [
    "Báo cáo & Thống kê",
    "Tổng hợp kết quả theo loại đánh giá và trạng thái.",
  ],
  users: ["Quyền đánh giá", "Thiết lập quyền xem và cập nhật đánh giá cho tài khoản của hệ thống."],
};
const parseExactTime = (value: string) => {
  const match = value.trim().match(/^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const hoursBetween = (start: string, end: string) => {
  const startDate = parseExactTime(start), endDate = parseExactTime(end);
  return startDate && endDate ? (endDate.getTime() - startDate.getTime()) / 3600000 : null;
};
const showHours = (hours: number | null) => hours === null ? "—" : `${hours.toFixed(2)} h`;
const failQtyFromScrapCode = (value: string) =>
  Array.from(value.matchAll(/\*\s*(\d+)/g)).reduce((total, match) => total + Number(match[1]), 0);
const stageFailQty = (stage: ManualStage) => {
  if (!stage.trackIn) return null;
  return failQtyFromScrapCode(stage.failCode);
};
const stageYield = (stage: ManualStage) => {
  const input = Number(stage.inputQty), output = Number(stage.outputQty);
  return stage.inputQty !== "" && stage.outputQty !== "" && input > 0 ? output / input * 100 : null;
};
const rdtTargetReached = (value: string, target: number) => value !== "" && Number(value) >= target;
const rdtPassReached = (rdt?: RdtData) => Boolean(rdt && Number(rdt.total) > 0 && Number(rdt.pass) >= Number(rdt.total));
const rdtHasEnteredData = (rdt?: RdtData) => Boolean(rdt && [
  rdt.total, rdt.pass, rdt.fail, rdt.tcTestResult, rdt.tc50, rdt.tc300, rdt.tc600,
  rdt.humidityResult, rdt.humidity120, rdt.humidity320, rdt.mechanical, rdt.shippingDate,
].some(Boolean) || Boolean(rdt && (rdt.tcQty !== "22" || rdt.humidityQty !== "45" || rdt.shipQty !== "10")));
const rdtIsComplete = (rdt?: RdtData) => Boolean(rdt
  && rdtTargetReached(rdt.tc50, 50)
  && rdtTargetReached(rdt.tc300, 300)
  && rdtTargetReached(rdt.tc600, 600)
  && rdtTargetReached(rdt.humidity120, 120)
  && rdtTargetReached(rdt.humidity320, 320));
const recalculateManualStages = (stages: ManualStage[], totalQuantity: number) => {
  let previousOutput = totalQuantity > 0 ? String(Math.round(totalQuantity)) : "";
  return stages.map((stage) => {
    if (/RDT/i.test(stage.stage)) return { ...stage, inputQty: "", outputQty: "" };
    if (!stage.trackIn) {
      previousOutput = "";
      return { ...stage, inputQty: "", outputQty: "" };
    }
    const inputQty = previousOutput;
    const failQty = failQtyFromScrapCode(stage.failCode);
    const outputQty = inputQty === "" ? "" : String(Math.max(0, Number(inputQty) - failQty));
    previousOutput = outputQty;
    return { ...stage, inputQty, outputQty };
  });
};
const fmtExactTime = (value: string) => {
  if (!value) return "—";
  const match = value.trim().match(/^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  return match ? `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}:${match[6] || "00"}` : value;
};
const fmtPlanDate = (value: string) => {
  if (!value) return "—";
  const match = value.match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value;
};
const noteValue = (note: string, labels: string[]) => {
  const part = (note || "").split(" · ").find((value) => labels.some((label) => value.startsWith(`${label}:`)));
  return part ? part.slice(part.indexOf(":") + 1).trim() : "";
};
const timelineTrackIn = (note: string) => noteValue(note, ["Track In", "Track in time", "In Date"]);
const timelineTrackOut = (note: string) => noteValue(note, ["Track Out", "Out Date"]);
const stageCodes = (stage: string) => Array.from(stage.matchAll(/M(\d{3})/gi), (match) => Number(match[1]));
const canonicalMassStage = (value: string) => {
  const upper = value.toUpperCase();
  return defaultManualStages.find((stage) => stageCodes(stage).some((code) => upper.includes(`M${String(code).padStart(3, "0")}`))) || "";
};
const massStageRank = (value: string) => defaultManualStages.findIndex((stage) => stage === canonicalMassStage(value) || stage === value);
const parseLotHistory = (rawText: string, startStep: string) => {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { stages: {} as Record<string, MassStage>, quantity: 0 };
  const cells = lines.map((line) => line.split("\t").map((cell) => cell.trim()));
  const header = cells[0].map((cell) => cell.toUpperCase().replaceAll(" ", "_"));
  const hasHeader = header.includes("EVENT_NAME") || header.includes("STEP");
  const index = (name: string, fallback: number) => { const found = header.indexOf(name); return found >= 0 ? found : fallback; };
  const eventIndex = index("EVENT_NAME", 0), dateIndex = index("DATE/TIME", 1), firstQtyIndex = index("QTY", 2), stepIndex = index("STEP", 3), eqpIndex = index("EQP", 4), chgItemIndex = index("CHG_ITEM", 7), chgValsIndex = index("CHG_VALS", 8), commentIndex = index("COMMENT", 10);
  const qtyIndexes = header.reduce<number[]>((result, value, cellIndex) => value === "QTY" ? [...result, cellIndex] : result, []);
  const rows = hasHeader ? cells.slice(1) : cells;
  const startRank = Math.max(0, massStageRank(startStep));
  const stages: Record<string, MassStage & { quantities?: number[] }> = {};
  for (const row of rows) {
    const stage = canonicalMassStage(row[stepIndex] || "");
    if (!stage || massStageRank(stage) < startRank) continue;
    const event = `${row[eventIndex] || ""} ${row[chgItemIndex] || ""} ${row[commentIndex] || ""}`.toUpperCase();
    const quantities = (qtyIndexes.length ? qtyIndexes : [firstQtyIndex, 9])
      .map((cellIndex) => String(row[cellIndex] ?? "").replaceAll(",", "").trim())
      .filter((value) => value !== "").map(Number).filter((value) => Number.isFinite(value) && value >= 0);
    const changeQty = String(row[qtyIndexes[1] ?? 9] ?? "").trim();
    const scrapCount = Number(`${row[chgValsIndex] || ""} ${row[commentIndex] || ""}`.match(/\*\s*(\d+)/)?.[1] || 0);
    const qty = /SCRAP|FAIL|NG/.test(event) ? (changeQty ? Number(changeQty.replaceAll(",", "")) || 0 : scrapCount || quantities[0] || 0) : quantities[0] ?? 0;
    const current = stages[stage] || { equipment: "", trackIn: "", trackOut: "", input: 0, output: 0, scrap: "", fail: 0, yield: 0, quantities: [] };
    current.equipment = current.equipment || row[eqpIndex] || "";
    current.quantities = [...(current.quantities || []), ...quantities];
    if (/TRACK.?IN|\bIN\b|INPUT|START/.test(event) && !/WAITING/.test(event)) { current.trackIn = current.trackIn || row[dateIndex] || ""; current.input = Math.max(current.input, qty); }
    if (/TRACK.?OUT|\bOUT\b|OUTPUT|END/.test(event)) { current.trackOut = row[dateIndex] || current.trackOut; current.output = Math.max(current.output, qty); }
    if (/SCRAP|FAIL|NG/.test(event)) {
      const codeSource = `${row[chgValsIndex] || ""} ${row[commentIndex] || ""} ${row[eventIndex] || ""}`;
      const code = codeSource.match(/\b\d{3,5}\b/)?.[0] || row[chgValsIndex] || "";
      current.scrap = [current.scrap, qty ? `${code}*${qty}` : code].filter(Boolean).join(" "); current.fail += qty;
    }
    stages[stage] = current;
  }
  for (const stage of Object.keys(stages)) {
    const item = stages[stage], observed = item.quantities || [];
    if (!item.input && observed.length) item.input = Math.max(...observed);
    if (!item.output && item.input) item.output = Math.max(0, item.input - item.fail);
    item.yield = item.input > 0 ? item.output / item.input * 100 : 0;
    delete item.quantities;
  }
  const smt = defaultManualStages[0], arts = defaultManualStages[2], router = defaultManualStages[3];
  const emptyStage = (): MassStage => ({ equipment: "", trackIn: "", trackOut: "", input: 0, output: 0, scrap: "", fail: 0, yield: 0 });
  if (stages[router] && startRank <= massStageRank(arts)) stages[arts] ||= emptyStage();
  if (stages[arts] && stages[router]) {
    const routerInputBefore = stages[router].input;
    if (stages[router].fail) {
      stages[arts].fail += stages[router].fail;
      stages[arts].scrap = [stages[arts].scrap, stages[router].scrap].filter(Boolean).join(" ");
      stages[router].fail = 0;
      stages[router].scrap = "";
    }
    stages[arts].input = routerInputBefore || stages[arts].input;
    stages[arts].output = Math.max(0, stages[arts].input - stages[arts].fail);
    stages[arts].yield = stages[arts].input ? stages[arts].output / stages[arts].input * 100 : 0;
    stages[router].input = stages[arts].output;
    stages[router].yield = stages[router].input ? stages[router].output / stages[router].input * 100 : 0;
  }
  if (stages[arts] && startRank <= massStageRank(smt)) {
    stages[smt] ||= emptyStage();
    stages[smt].equipment = "";
    stages[smt].input = stages[arts].input;
    stages[smt].output = Math.max(0, stages[smt].input - stages[smt].fail);
    stages[smt].yield = stages[smt].input ? stages[smt].output / stages[smt].input * 100 : 0;
  }
  const first = defaultManualStages.slice(startRank).find((stage) => stages[stage]);
  return { stages: stages as Record<string, MassStage>, quantity: first ? stages[first].input : 0 };
};
const normalizeMassLotQuantities = (lot: MassLot): MassLot => {
  const stages = Object.fromEntries(Object.entries(lot.stages || {}).map(([stage, value]) => [stage, { ...value }])) as Record<string, MassStage>;
  const smtName = defaultManualStages[0], artsName = defaultManualStages[2], routerName = defaultManualStages[3];
  const blank = (): MassStage => ({ equipment: "", trackIn: "", trackOut: "", input: 0, output: 0, scrap: "", fail: 0, yield: 0 });
  const router = stages[routerName];
  if (router) {
    const arts = stages[artsName] || blank();
    if (router.fail) {
      arts.fail += router.fail;
      arts.scrap = [arts.scrap, router.scrap].filter(Boolean).join(" ");
      router.fail = 0;
      router.scrap = "";
    }
    const alreadyLinked = arts.input > 0 && arts.output === router.input && arts.output === Math.max(0, arts.input - arts.fail);
    if (!alreadyLinked) arts.input = router.input || arts.input;
    arts.output = Math.max(0, arts.input - arts.fail);
    arts.yield = arts.input ? arts.output / arts.input * 100 : 0;
    stages[artsName] = arts;
    router.input = arts.output;
    router.yield = router.input ? router.output / router.input * 100 : 0;
    stages[routerName] = router;
  }
  const arts = stages[artsName];
  if (arts) {
    const smt = stages[smtName] || blank();
    smt.equipment = "";
    smt.input = arts.input;
    smt.output = Math.max(0, smt.input - smt.fail);
    smt.yield = smt.input ? smt.output / smt.input * 100 : 0;
    stages[smtName] = smt;
  }
  return { ...lot, stages, quantity: Number(stages[smtName]?.input) || lot.quantity };
};
const decodeSplitLots = (value: string): SplitLot[] => {
  if (!value) return [];
  try {
    const rows = JSON.parse(decodeURIComponent(value));
    return Array.isArray(rows) ? rows.map((row) => ({
      lotId: String(row?.lotId ?? ""), equipment: String(row?.equipment ?? ""),
      trackIn: String(row?.trackIn ?? ""), trackOut: String(row?.trackOut ?? ""),
      inputQty: String(row?.inputQty ?? ""), outputQty: String(row?.outputQty ?? ""), failCode: String(row?.failCode ?? ""),
      stages: row?.stages && typeof row.stages === "object" ? Object.fromEntries(Object.entries(row.stages).map(([key, raw]) => {
        const stage = raw as Partial<SplitLot>;
        return [key, { equipment: String(stage?.equipment ?? ""), trackIn: String(stage?.trackIn ?? ""), trackOut: String(stage?.trackOut ?? ""), inputQty: String(stage?.inputQty ?? ""), outputQty: String(stage?.outputQty ?? ""), failCode: String(stage?.failCode ?? "") }];
      })) : {},
    })).filter((row) => row.lotId) : [];
  } catch { return []; }
};
// Set from Home on every render, before its children render. Vietnamese keeps the original
// d/m/y and 1.000 forms; Korean and English use 2026-10-02 and 1,000, because "1.000" reads as
// one in those languages and d/m/y is ambiguous.
let displayLanguage: Language = "ko";
const fmtCount = (value: number) => value.toLocaleString(displayLanguage === "vi" ? "vi-VN" : "en-US");
const isoParts = (date: Date, withTime: boolean) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}) }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}${withTime ? ` ${parts.hour}:${parts.minute}` : ""}`;
};
const fmtDate = (v: string) => {
  if (!v) return "—";
  const date = new Date(v.includes("T") ? `${v}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? "" : "+07:00"}` : `${v}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return v;
  return displayLanguage === "vi" ? new Intl.DateTimeFormat("vi-VN").format(date) : isoParts(date, false);
};
const fmtTime = (v: string) => {
  if (!v) return "—";
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) return v;
  return displayLanguage === "vi"
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(date)
    : isoParts(date, true);
};

export default function Home() {
  const [language, setLanguage] = useState<Language>((new URLSearchParams(location.search).get("lang") as Language) || "ko");
  displayLanguage = language;
  const [view, setView] = useState<View>((new URLSearchParams(location.search).get("section") as View) || "overview"),
    [data, setData] = useState<Evaluation[]>([]),
    [history, setHistory] = useState<History[]>([]),
    [massReports, setMassReports] = useState<MassReport[]>([]),
    [tab, setTab] = useState("Tất cả"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [listFilters, setListFilters] = useState({
    evaluationNo: "", evaluationType: "", classification: "", product: "", formFactor: "", status: "", currentStep: "",
    smtLot: "", lotCurrent: "", partNo: "", dateFrom: "", dateTo: "",
  });
  const [listStatusDraft, setListStatusDraft] = useState("");
  const [listStatusOpen, setListStatusOpen] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);
  const [me, setMe] = useState<Me | null>(null),
    [authMode, setAuthMode] = useState<
      "loading" | "signin" | "register" | "pending" | "approved"
    >("loading"),
    [users, setUsers] = useState<AppUser[]>([]),
    [credentials, setCredentials] = useState({ username: "", password: "" });
  const [timelineLot, setTimelineLot] = useState<Evaluation | null>(null),
    [timeline, setTimeline] = useState<TimelineItem[]>([]),
    [timelineBusy, setTimelineBusy] = useState(false);
  const [detailLot, setDetailLot] = useState<Evaluation | null>(null),
    [detailTimeline, setDetailTimeline] = useState<TimelineItem[]>([]),
    [detailBusy, setDetailBusy] = useState(false);
  const [overviewQuery, setOverviewQuery] = useState("");
  const [overviewOtherQuery, setOverviewOtherQuery] = useState("");
  const [newProductNo, setNewProductNo] = useState("");
  const [dashboardDateFrom, setDashboardDateFrom] = useState("");
  const [dashboardDateTo, setDashboardDateTo] = useState("");
  const [overviewSmtLot, setOverviewSmtLot] = useState(""),
    [overviewLot, setOverviewLot] = useState<Evaluation | null>(null),
    [overviewTimeline, setOverviewTimeline] = useState<TimelineItem[]>([]),
    [overviewBusy, setOverviewBusy] = useState(false),
    [overviewMessage, setOverviewMessage] = useState("");
  const [importModal, setImportModal] = useState(false),
    [importPreview, setImportPreview] = useState<WorkbookImport | null>(null),
    [importFile, setImportFile] = useState<File | null>(null),
    [notice, setNotice] = useState("");
  const [editModal, setEditModal] = useState(false),
    [editing, setEditing] = useState<number | null>(null),
    [draft, setDraft] = useState<Draft>(emptyDraft),
    [reportingId, setReportingId] = useState<number | null>(null),
    [manualModal, setManualModal] = useState(false),
    [manualDraft, setManualDraft] = useState<ManualDraft>(createManualDraft()),
    [seeLotFiles, setSeeLotFiles] = useState<File[]>([]),
    [seeFileMessage, setSeeFileMessage] = useState("");
  const [seeUpdateModal, setSeeUpdateModal] = useState(false), [seeUpdatePartNo, setSeeUpdatePartNo] = useState(""),
    [seeUpdateLotId, setSeeUpdateLotId] = useState(""), [seeUpdateRows, setSeeUpdateRows] = useState<string[][]>(emptySeeUpdateRows);
  const [massModal, setMassModal] = useState(false), [massDraft, setMassDraft] = useState<MassDraft>(createMassDraft()), [activeMassLot, setActiveMassLot] = useState(0);
  const [deletingMassId, setDeletingMassId] = useState<number | null>(null);
  const [massLotEditor, setMassLotEditor] = useState(false), [massPendingHistory, setMassPendingHistory] = useState("");
  const [massEditorRows, setMassEditorRows] = useState<string[][]>(emptySeeUpdateRows);
  const [massFilters, setMassFilters] = useState({ evaluationNo: "", evaluationType: "", classification: "", product: "", formFactor: "", status: "", partNo: "" });
  const [massTab, setMassTab] = useState("Tất cả"), [massPage, setMassPage] = useState(1), [massPageSize, setMassPageSize] = useState(10);
  const [manualFromMassReport, setManualFromMassReport] = useState(false);
  const syncMassDraftFromLots = (current: MassDraft, lots: MassLot[]) => {
    const matched = lots.map((lot) => lookupPartNumber(lot.partNo)).find(Boolean);
    const partNos = [...new Set(lots.map((lot) => lot.partNo.trim().toUpperCase().slice(0, 22)).filter(Boolean))];
    const densities = [...new Set(partNos.map((partNo) => partNo.slice(5, 8)).filter(Boolean))];
    return { ...current, lots,
      ...(matched ? { evaluationNo: matched.no, product: matched.product, formFactor: matched.formFactor } : {}),
      partId: partNos.join(", "), density: densities.join(", ") || current.density };
  };
  const updateMassDraftLot = (index: number, patch: Partial<MassLot>) => setMassDraft((current) => {
    const lots = current.lots.map((lot, rowIndex) => rowIndex === index ? { ...lot, ...patch } : lot);
    return syncMassDraftFromLots(current, lots);
  });
  const updateMassStage = (index: number, stage: string, field: keyof MassStage, value: string) => setMassDraft((current) => {
    const lots = current.lots.map((lot, rowIndex) => {
      if (rowIndex !== index) return lot;
      const before = lot.stages[stage] || { equipment: "", trackIn: "", trackOut: "", input: 0, output: 0, scrap: "", fail: 0, yield: 0 };
      const next = { ...before, [field]: ["input", "output", "fail", "yield"].includes(field) ? Math.max(0, Number(value) || 0) : value };
      if ([defaultManualStages[0], defaultManualStages[2]].includes(stage) && (field === "input" || field === "fail")) {
        next.output = Math.max(0, next.input - next.fail);
      }
      if (field === "input" || field === "output" || field === "fail") next.yield = next.input ? next.output / next.input * 100 : 0;
      const stages = { ...lot.stages, [stage]: next };
      if (stage === defaultManualStages[2]) {
        const smtBefore = stages[defaultManualStages[0]] || { equipment: "", trackIn: "", trackOut: "", input: 0, output: 0, scrap: "", fail: 0, yield: 0 };
        const smt = { ...smtBefore, equipment: "", input: next.input };
        smt.output = Math.max(0, smt.input - smt.fail);
        smt.yield = smt.input ? smt.output / smt.input * 100 : 0;
        stages[defaultManualStages[0]] = smt;
        const router = stages[defaultManualStages[3]];
        if (router) stages[defaultManualStages[3]] = { ...router, input: next.output, yield: next.output ? router.output / next.output * 100 : 0 };
      }
      return { ...lot, stages, quantity: Number(stages[defaultManualStages[0]]?.input) || lot.quantity };
    });
    return { ...current, lots };
  });
  const pasteMassDraftLots = (event: ClipboardEvent<HTMLInputElement>, startIndex: number, target: "partNo" | "lotNo") => {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\n") && !text.includes("\t")) return;
    event.preventDefault();
    const rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => line.split("\t").map((cell) => cell.trim().toUpperCase()));
    setMassDraft((current) => {
      const lots = [...current.lots];
      while (lots.length < startIndex + rows.length) lots.push(emptyMassLot());
      rows.forEach((cells, offset) => {
        const previous = lots[startIndex + offset];
        lots[startIndex + offset] = cells.length > 1
          ? { ...previous, partNo: cells[0] || previous.partNo, lotNo: cells[1] || previous.lotNo }
          : { ...previous, [target]: cells[0] };
      });
      return syncMassDraftFromLots(current, lots);
    });
  };
  const persistMassDraft = async (draft: MassDraft) => {
    const lots = draft.lots.filter((lot) => lot.partNo && lot.lotNo);
    const response = await fetch("/api/evaluation/mass-reports", {
      method: draft.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, lots }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Không thể lưu báo cáo.");
    const report = payload.report as MassReport;
    setMassReports((current) => draft.id ? current.map((item) => item.id === report.id ? report : item) : [report, ...current]);
    setMassDraft({ ...draft, id: report.id });
    return report;
  };
  const exportMassReport = (report: MassReport) => {
    const workbook = buildMassReportExcel(report, defaultManualStages);
    const url = URL.createObjectURL(new Blob([new Uint8Array(workbook)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Bao-cao-${report.evaluationType}-No-${report.evaluationNo}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const deleteMassReport = async (report: MassReport) => {
    if (!window.confirm(translateDynamic(`Xóa báo cáo ${report.evaluationType} No. ${report.evaluationNo} và các Lot của báo cáo này?`, language))) return;
    setDeletingMassId(report.id); setError("");
    try {
      const response = await fetch(`/api/evaluation/mass-reports?id=${report.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không thể xóa báo cáo.");
      setMassReports((current) => current.filter((item) => item.id !== report.id));
      setNotice("Đã xóa báo cáo.");
    } catch (error) { setError(error instanceof Error ? error.message : "Không thể xóa báo cáo."); }
    finally { setDeletingMassId(null); }
  };
  const importMassHistory = async (historyText = massPendingHistory) => {
    if (!historyText.trim()) { setMassLotEditor(false); return; }
    const parsed = parseLotHistory(historyText, massDraft.startStep);
    if (!Object.keys(parsed.stages).length) { setError("Lịch sử Lot không có công đoạn phù hợp để nhập."); return; }
    const lots = massDraft.lots.map((lot, index) => {
      if (index !== activeMassLot) return lot;
      const stages = { ...lot.stages };
      for (const [stage, value] of Object.entries(parsed.stages)) {
        if (!stages[stage]) stages[stage] = value;
      }
      const arts = defaultManualStages[2], router = defaultManualStages[3];
      if (stages[arts] && parsed.stages[router]?.fail && !lot.stages[router]) {
        stages[arts] = { ...stages[arts], fail: stages[arts].fail + stages[router].fail,
          scrap: [stages[arts].scrap, stages[router].scrap].filter(Boolean).join(" ") };
        stages[arts].yield = stages[arts].input ? stages[arts].output / stages[arts].input * 100 : 0;
        stages[router] = { ...stages[router], fail: 0, scrap: "", input: stages[arts].output || stages[router].input };
        stages[router].yield = stages[router].input ? stages[router].output / stages[router].input * 100 : 0;
      }
      return normalizeMassLotQuantities({ ...lot, stages, quantity: Number(stages[defaultManualStages[0]]?.input) || lot.quantity || parsed.quantity,
        rawText: [lot.rawText, historyText].filter(Boolean).join("\n") });
    });
    const next = { ...massDraft, lots };
    setBusy(true); setError("");
    try { await persistMassDraft(next); setMassPendingHistory(""); setMassLotEditor(false); setNotice("Đã nhập dữ liệu Lot; dữ liệu công đoạn trước được giữ nguyên."); }
    catch (error) { setError(error instanceof Error ? error.message : "Không thể nhập dữ liệu Lot."); }
    finally { setBusy(false); }
  };
  const openMassLotEditor = (index: number) => {
    setActiveMassLot(index); setMassPendingHistory(""); setMassEditorRows(emptySeeUpdateRows()); setError(""); setMassLotEditor(true);
  };
  const updateMassEditorCell = (rowIndex: number, columnIndex: number, value: string) => setMassEditorRows((current) => {
    const rows = current.map((row) => [...row]); rows[rowIndex][columnIndex] = value; return rows;
  });
  const pasteMassEditorTable = (event: ClipboardEvent<HTMLInputElement>, startRow: number, startColumn: number) => {
    const clipboard = event.clipboardData.getData("text");
    if (!clipboard.includes("\t") && !clipboard.includes("\n")) return;
    event.preventDefault();
    const pasted = clipboard.replace(/\r/g, "").split("\n").filter((line, index, rows) => line.length || index < rows.length - 1).map((line) => line.split("\t"));
    setMassEditorRows((current) => {
      const rows = current.map((row) => [...row]);
      while (rows.length < startRow + pasted.length) rows.push(Array.from({ length: seeUpdateHeaders.length }, () => ""));
      pasted.forEach((sourceRow, rowOffset) => sourceRow.slice(0, seeUpdateHeaders.length - startColumn)
        .forEach((value, columnOffset) => { rows[startRow + rowOffset][startColumn + columnOffset] = value.trim(); }));
      return rows;
    });
  };
  const saveMassEditorData = () => {
    const populated = massEditorRows.filter((row) => row.some((cell) => cell.trim()));
    const history = [seeUpdateHeaders, ...populated].map((row) => row.join("\t")).join("\n");
    void importMassHistory(history);
  };
  const load = async () => {
    setLoading(true);
    try {
      const auth = await fetch("/api/evaluation/auth/session"),
        m = await auth.json();
      if (auth.status === 401) {
        window.top?.location.assign("/login");
        return;
      }
      if (!auth.ok) throw new Error(m.error);
      setMe(m);
      setAuthMode("approved");
      const calls = [
        fetch("/api/evaluation/evaluations"),
        fetch("/api/evaluation/history"),
        fetch("/api/evaluation/mass-reports"),
        ...(m.user.role === "admin" ? [fetch("/api/evaluation/users")] : []),
      ];
      const results = await Promise.all(calls),
        e = await results[0].json(),
        h = await results[1].json();
      const mass = await results[2].json();
      if (!results[0].ok) throw new Error(e.error);
      setData(e.evaluations);
      if (results[1].ok) setHistory(h.history);
      if (results[2].ok) setMassReports(mass.reports);
      if (results[3]) {
        const u = await results[3].json();
        if (results[3].ok) setUsers(u.users);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const saved = new URLSearchParams(location.search).get("lang") || localStorage.getItem("qeval-language");
    if (saved === "vi" || saved === "en" || saved === "ko") setLanguage(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("qeval-language", language);
    document.documentElement.lang = language === "ko" ? "ko" : language;
    let queued = false;
    const run = () => applyLanguage(document.body, language);
    run();
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        run();
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title"],
    });
    return () => observer.disconnect();
  }, [language]);
  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/evaluation/auth/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(credentials),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setCredentials((c) => ({ ...c, password: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đăng nhập.");
    } finally {
      setBusy(false);
    }
  };
  const register = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/evaluation/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(credentials),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setCredentials((c) => ({ ...c, password: "" }));
      setAuthMode("pending");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể gửi yêu cầu.");
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    const form = document.createElement("form"); form.method = "POST"; form.action = "/logout"; form.target = "_top"; document.body.append(form); form.submit();
  };
  const updateUser = async (
    user: AppUser,
    role: AppUser["role"],
    nextStatus: AppUser["status"],
  ) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/evaluation/users", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: user.id, role, status: nextStatus }),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể cập nhật quyền.");
    } finally {
      setBusy(false);
    }
  };
  const listEvaluationTypes = useMemo(() => Array.from(new Set([...evaluationTypes, ...data.map((item) => item.evaluationType).filter(Boolean), ...massReports.map((item) => item.evaluationType).filter(Boolean)])), [data, massReports]);
  const listEvaluationNos = useMemo(() => Array.from(new Set([...data.map((item) => item.evaluationNo.trim()), ...massReports.map((item) => item.evaluationNo.trim())].filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi", { numeric: true })), [data, massReports]);
  const listClassifications = useMemo(() => Array.from(new Set([...data.map((item) => item.evaluationContent), ...massReports.map((item) => item.classification)].filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")), [data, massReports]);
  const listProducts = useMemo(() => Array.from(new Set([...data.map((item) => item.product), ...massReports.map((item) => item.product)].filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")), [data, massReports]);
  const listFormFactors = useMemo(() => Array.from(new Set([...data.map((item) => item.formFactor), ...massReports.map((item) => item.formFactor)].filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")), [data, massReports]);
  const listSteps = useMemo(() => Array.from(new Set([...data.map((item) => item.currentStep || item.step), ...massReports.map((item) => item.startStep)].filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")), [data, massReports]);
  const rows = useMemo(() => [...data.map((item) => ({ kind: "evaluation" as const, item })), ...massReports.map((item) => ({ kind: "report" as const, item }))].filter((entry) => {
    const x = entry.item;
    const isReport = entry.kind === "report";
    const smtLot = isReport ? "" : noteValue(x.note, ["SMT Lot"]);
    const classification = isReport ? x.classification : x.evaluationContent;
    const currentStep = isReport ? x.startStep : (x.currentStep || x.step);
    const lotCurrent = isReport ? x.lots.map((lot) => lot.lotNo).join(", ") : x.lotNo;
    const partNo = isReport ? x.lots.map((lot) => lot.partNo).join(", ") : x.partNo;
    const targetDate = isReport ? x.updatedAt : x.targetDate;
    const selectedStatuses = listFilters.status.split("|").filter(Boolean);
    const includes = (value: string, search: string) => value.toLowerCase().includes(search.trim().toLowerCase());
    const includesAny = (value: string, search: string) => search.split(",").map((item) => item.trim()).filter(Boolean).some((item) => includes(value, item));
    return (tab === "Tất cả" || x.evaluationType === tab)
      && (!listFilters.evaluationNo || includesAny(x.evaluationNo, listFilters.evaluationNo))
      && (!listFilters.evaluationType || x.evaluationType === listFilters.evaluationType)
      && (!listFilters.classification || classification === listFilters.classification)
      && (!listFilters.product || x.product === listFilters.product)
      && (!listFilters.formFactor || x.formFactor === listFilters.formFactor)
      && (!selectedStatuses.length || selectedStatuses.includes(x.status))
      && (!listFilters.currentStep || currentStep === listFilters.currentStep)
      && (!listFilters.smtLot || includes(smtLot, listFilters.smtLot))
      && (!listFilters.lotCurrent || includes(lotCurrent, listFilters.lotCurrent))
      && (!listFilters.partNo || includes(partNo, listFilters.partNo))
      && (!listFilters.dateFrom || targetDate.slice(0, 10) >= listFilters.dateFrom)
      && (!listFilters.dateTo || targetDate.slice(0, 10) <= listFilters.dateTo);
  }), [data, massReports, tab, listFilters]);
  const listPageCount = Math.max(1, Math.ceil(rows.length / listPageSize));
  const safeListPage = Math.min(listPage, listPageCount);
  const pageRows = rows.slice((safeListPage - 1) * listPageSize, safeListPage * listPageSize);
  const setListFilter = (key: keyof typeof listFilters, value: string) => {
    setListFilters((current) => ({ ...current, [key]: value }));
    setListPage(1);
  };
  const stats = {
    total: data.length,
    running: data.filter((x) => x.status === "Đang đánh giá").length,
    hold: data.filter(
      (x) =>
        x.status === "Hold" ||
        (x.targetDate &&
          x.status !== "Hoàn thành" &&
          new Date(x.targetDate) < new Date()),
    ).length,
    done: data.filter((x) => x.status === "Hoàn thành").length,
    pass: data.filter((x) => x.result === "PASS").length,
  };
  const role = me?.user?.role,
    canEdit = role === "admin" || role === "editor",
    canAdmin = role === "admin";
  const loadTimeline = async (id: number) => {
    setTimelineBusy(true);
    try {
      const r = await fetch(`/api/evaluation/timeline?evaluationId=${id}`),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setTimeline(j.timeline);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải timeline.");
    } finally {
      setTimelineBusy(false);
    }
  };
  const openTimeline = async (x: Evaluation) => {
    setTimelineLot(x);
    setTimeline([]);
    setError("");
    await loadTimeline(x.id);
  };
  const openEvaluationDetail = async (evaluation: Evaluation) => {
    setDetailLot(evaluation);
    setDetailTimeline([]);
    setDetailBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/evaluation/timeline?evaluationId=${evaluation.id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setDetailTimeline(payload.timeline as TimelineItem[]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể tải bảng thông tin Lot.");
    } finally {
      setDetailBusy(false);
    }
  };
  const showOverviewLot = async (evaluation: Evaluation) => {
    setOverviewSmtLot(noteValue(evaluation.note, ["SMT Lot"]));
    setOverviewLot(evaluation);
    setOverviewTimeline([]);
    setOverviewMessage("");
    setOverviewBusy(true);
    try {
      const response = await fetch(`/api/evaluation/timeline?evaluationId=${evaluation.id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setOverviewTimeline(payload.timeline as TimelineItem[]);
    } catch (error) {
      setOverviewMessage(error instanceof Error ? error.message : "Không thể tải dữ liệu Lot.");
    } finally {
      setOverviewBusy(false);
    }
  };
  const findOverviewLot = (value: string) => {
    const key = value.trim().toLowerCase();
    const evaluation = data.find(
      (item) => item.note.includes("Nguồn: Nhập thủ công") &&
        noteValue(item.note, ["SMT Lot"]).trim().toLowerCase() === key,
    );
    if (!evaluation) {
      setOverviewLot(null);
      setOverviewTimeline([]);
      setOverviewMessage(key ? "Không tìm thấy SMT Lot trong dữ liệu nhập thủ công." : "Vui lòng nhập SMT Lot.");
      return;
    }
    void showOverviewLot(evaluation);
  };
  const openEdit = (x: Evaluation) => {
    const { id, createdAt, updatedAt, ...values } = x;
    void id;
    void createdAt;
    void updatedAt;
    setEditing(x.id);
    setDraft(values);
    setError("");
    setEditModal(true);
  };
  const setDraftValue = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/evaluation/evaluations", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...draft, id: editing }),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setEditModal(false);
      setNotice(`Đã lưu cập nhật Lot ${draft.lotNo}.`);
      await load();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Không thể lưu dữ liệu.",
      );
    } finally {
      setBusy(false);
    }
  };
  const deleteEvaluation = async (x: Evaluation) => {
    if (!confirm(translateDynamic(`Xóa Lot ${x.lotNo}? Timeline của Lot này cũng sẽ bị xóa.`, language)))
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/evaluation/evaluations?id=${x.id}`, {
          method: "DELETE",
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setEditModal(false);
      setNotice(`Đã xóa Lot ${x.lotNo}.`);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể xóa Lot.");
    } finally {
      setBusy(false);
    }
  };
  const openManual = () => {
    setManualFromMassReport(false);
    setManualDraft(createManualDraft());
    setSeeLotFiles([]);
    setSeeFileMessage("");
    setError("");
    setNotice("");
    setManualModal(true);
  };
  const openMassManual = () => {
    const next = createManualDraft();
    next.evaluationType = "1K";
    setManualFromMassReport(true);
    setManualDraft(next);
    setSeeLotFiles([]);
    setSeeFileMessage("");
    setError("");
    setNotice("");
    setManualModal(true);
  };
  const openNewMassReport = () => {
    setMassDraft(createMassDraft());
    setActiveMassLot(0);
    setMassModal(true);
    setError("");
  };
  const openExistingMassReport = (report: MassReport) => {
    const normalizedLots = report.lots.map(normalizeMassLotQuantities);
    const { quantity: _quantity, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = report;
    void _quantity; void _createdAt; void _updatedAt;
    setMassDraft({ ...draft, id: report.id, lots: [...normalizedLots, ...Array.from({ length: Math.max(0, 14 - normalizedLots.length) }, emptyMassLot)] });
    setActiveMassLot(0);
    setMassModal(true);
    setError("");
  };
  const openManualUpdate = async (evaluation: Evaluation) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/evaluation/timeline?evaluationId=${evaluation.id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const loadedStages: ManualStage[] = (payload.timeline as TimelineItem[]).map((item) => ({
        id: item.id,
        stage: item.stage,
        equipment: noteValue(item.note, ["EQP", "Equipment", "Machine"]),
        trackIn: fmtExactTime(timelineTrackIn(item.note)) === "—" ? "" : fmtExactTime(timelineTrackIn(item.note)),
        trackOut: fmtExactTime(timelineTrackOut(item.note)) === "—" ? "" : fmtExactTime(timelineTrackOut(item.note)),
        inputQty: noteValue(item.note, ["Input", "INPUT"]),
        outputQty: noteValue(item.note, ["Output", "OUTPUT"]),
        failCode: noteValue(item.note, ["Fail code", "FAIL CODE"]),
        reason: noteValue(item.note, ["Waiting Reason"]),
        ...(/RDT/i.test(item.stage) ? { rdt: {
          total: noteValue(item.note, ["RDT Total"]),
          pass: noteValue(item.note, ["RDT Pass"]),
          fail: noteValue(item.note, ["RDT Fail", "RDT Wait"]),
          tcQty: noteValue(item.note, ["TC Q'ty Test", "TC Qty Test"]) || "22",
          tcTestResult: noteValue(item.note, ["TC Test Result"]),
          tc50: noteValue(item.note, ["TC 50cyc"]),
          tc300: noteValue(item.note, ["TC 300cyc"]),
          tc600: noteValue(item.note, ["TC 600cyc"]),
          humidityQty: noteValue(item.note, ["Humidity Q'ty Test", "Humidity Qty Test"]) || "45",
          humidityResult: noteValue(item.note, ["Humidity Result"]),
          humidity120: noteValue(item.note, ["Humidity 120hr"]),
          humidity320: noteValue(item.note, ["Humidity 320hr"]),
          shipQty: noteValue(item.note, ["Q'ty Ship", "Qty Ship"]) || "10",
          mechanical: noteValue(item.note, ["Mechanical"]),
          shippingDate: noteValue(item.note, ["Shipping Date"]),
        } } : {}),
        originalNote: item.note,
      }));
      const hasManualStepPlan = evaluation.note.includes("Manual Steps:");
      const savedPlannedStages = hasManualStepPlan
        ? noteValue(evaluation.note, ["Manual Steps"]).split("|").map((stage) => stage.trim()).filter(Boolean)
        : defaultManualStages;
      let plannedStages = savedPlannedStages.some((stage) => /M125|LED/i.test(stage))
        ? savedPlannedStages
        : (() => {
            const next = [...savedPlannedStages];
            const agingIndex = next.findIndex((stage) => /M100|M111|AGING/i.test(stage));
            next.splice(agingIndex >= 0 ? agingIndex + 1 : next.length, 0, "LED Test (M125)");
            return next;
          })();
      if (evaluation.evaluationType.trim().toUpperCase() === "PRQ" && !plannedStages.some((stage) => /RDT/i.test(stage))) {
        const next = [...plannedStages];
        const agingIndex = next.findIndex((stage) => /M100|M111|AGING/i.test(stage));
        next.splice(agingIndex >= 0 ? agingIndex + 1 : next.length, 0, "RDT Test");
        plannedStages = next;
      }
      const stagesMatch = (first: string, second: string) => {
        const firstCodes = stageCodes(first), secondCodes = stageCodes(second);
        return firstCodes.length && secondCodes.length
          ? firstCodes.some((code) => secondCodes.includes(code))
          : first.trim().toLowerCase() === second.trim().toLowerCase();
      };
      const visibleLoadedStages = hasManualStepPlan
        ? loadedStages.filter((loaded) => plannedStages.some((planned) => stagesMatch(planned, loaded.stage)))
        : loadedStages;
      const missingStages = plannedStages
        .filter((stage) => {
          return !visibleLoadedStages.some((loaded) => stagesMatch(stage, loaded.stage));
        })
        .map(emptyManualStage);
      const stages = [...visibleLoadedStages, ...missingStages].sort((first, second) => {
        const firstCode = /RDT/i.test(first.stage) ? 111.5 : stageCodes(first.stage)[0] ?? 9999;
        const secondCode = /RDT/i.test(second.stage) ? 111.5 : stageCodes(second.stage)[0] ?? 9999;
        return firstCode - secondCode;
      });
      setManualDraft({
        evaluationId: evaluation.id,
        evaluationNo: evaluation.evaluationNo,
        product: evaluation.product,
        formFactor: evaluation.formFactor || "",
        density: evaluation.density,
        evaluationType: evaluation.evaluationType,
        classification: evaluation.evaluationContent,
        partNo: evaluation.partNo,
        smtLot: noteValue(evaluation.note, ["SMT Lot"]),
        lane: evaluation.equipment,
        quantity: evaluation.quantity,
        planDateIn: fmtPlanDate(evaluation.targetDate) === "—" ? "" : fmtPlanDate(evaluation.targetDate),
        lotCurrent: evaluation.lotNo,
        status: evaluation.status,
        statusReason: noteValue(evaluation.note, ["Status Reason"]),
        approvalStatus: evaluation.approvalStatus || "Chưa phê duyệt",
        stages,
        splitLots: decodeSplitLots(noteValue(evaluation.note, ["Split Lots"])),
      });
      setNotice("");
      setSeeLotFiles([]);
      setSeeFileMessage("");
      setManualModal(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể tải dữ liệu Lot.");
    } finally {
      setBusy(false);
    }
  };
  const setManualValue = <K extends keyof ManualDraft>(key: K, value: ManualDraft[K]) =>
    setManualDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "evaluationType" && !current.evaluationId) {
        const hasStageData = current.stages.some((stage) => stage.trackIn || stage.trackOut || stage.failCode || stage.equipment || rdtHasEnteredData(stage.rdt));
        if (!hasStageData) next.stages = stagesForEvaluationType(String(value)).map(emptyManualStage);
      }
      return key === "quantity"
        ? { ...next, stages: recalculateManualStages(next.stages, Number(value) || 0) }
        : next;
    });
  const setManualPartNo = (value: string) =>
    setManualDraft((current) => {
      const normalized = value.toUpperCase();
      const matched = normalized.trim().length >= 12 ? lookupPartNumber(normalized) : null;
      return {
        ...current,
        partNo: normalized,
        density: normalized.slice(5, 8).toUpperCase(),
        ...(matched
          ? {
              evaluationNo: matched.no,
              product: matched.product,
              formFactor: matched.formFactor,
            }
          : {}),
      };
    });
  const stageMergeKey = (stage: string) => /RDT/i.test(stage) ? "rdt" : stageCodes(stage).join("-") || stage.trim().toUpperCase();
  const stageHasImportedData = (stage: ManualStage) => Boolean(stage.trackIn || stage.trackOut || stage.equipment || stage.failCode || stage.inputQty || stage.outputQty || rdtHasEnteredData(stage.rdt));
  const applySeeLotPrefills = (prefills: SeeLotManualPrefill[]) => {
    if (!prefills.length) return;
    const smtLots = [...new Set(prefills.map(item => item.smtLot))];
    if (smtLots.length > 1) throw new Error(`Các file không cùng SMT Lot: ${smtLots.join(", ")}.`);
    const partNos = [...new Set(prefills.map(item => item.partNo).filter(Boolean))];
    if (partNos.length > 1) throw new Error("Các file SEE Lot có Part No. tại ô A1 không giống nhau.");
    const activeGroups = new Map<string, ManualStage[]>();
    for (const prefill of prefills) for (const stage of prefill.stages as ManualStage[]) {
      if (!stageHasImportedData(stage)) continue;
      const key = stageMergeKey(stage.stage);
      activeGroups.set(key, [...(activeGroups.get(key) ?? []), stage]);
    }
    const combinedActive = [...activeGroups.values()].map(group => {
      if (group.length === 1) return { ...group[0] };
      const first = group[0];
      const timesIn = group.map(stage => stage.trackIn).filter(Boolean).sort();
      const timesOut = group.map(stage => stage.trackOut).filter(Boolean).sort();
      const equipments = [...new Set(group.map(stage => stage.equipment).filter(Boolean))];
      return {
        ...first,
        equipment: equipments.join(", "), trackIn: timesIn[0] || "", trackOut: timesOut.at(-1) || "",
        inputQty: String(group.reduce((sum, stage) => sum + (Number(stage.inputQty) || 0), 0) || ""),
        outputQty: String(group.reduce((sum, stage) => sum + (Number(stage.outputQty) || 0), 0) || ""),
        failCode: group.map(stage => stage.failCode).filter(Boolean).join(" "),
      };
    });
    const splitLots: SplitLot[] = prefills.length > 1 && prefills.some(item => item.startsFromSmt)
      ? prefills.map(item => {
          const source = item.stages.find(stage => /M031|IARTS|ARTS/i.test(stage.stage))
            || item.stages.find(stage => /M010|M015|SMT/i.test(stage.stage));
          const stages = Object.fromEntries(item.stages.filter(stage => (stageCodes(stage.stage)[0] ?? 0) >= 31).map(stage => [stageMergeKey(stage.stage), {
            equipment: stage.equipment || "", trackIn: stage.trackIn || "", trackOut: stage.trackOut || "",
            inputQty: stage.inputQty || "", outputQty: stage.outputQty || "", failCode: stage.failCode || "",
          }]));
          return { lotId: item.lotId, equipment: source?.equipment || "", trackIn: source?.trackIn || "", trackOut: source?.trackOut || "", inputQty: source?.inputQty || String(item.quantity || ""), outputQty: source?.outputQty || String(item.quantity || ""), failCode: source?.failCode || "", stages };
        }) : [];
    setManualDraft((current) => {
      const existingActive = new Map(current.stages.filter(stageHasImportedData).map(stage => [stageMergeKey(stage.stage), stage]));
      for (const imported of combinedActive) {
        const key = stageMergeKey(imported.stage), existing = existingActive.get(key);
        existingActive.set(key, { ...existing, ...imported, id: existing?.id });
      }
      const active = [...existingActive.values()].sort((a, b) => (stageCodes(a.stage)[0] ?? 999) - (stageCodes(b.stage)[0] ?? 999));
      const lastCode = Math.max(0, ...active.flatMap(stage => stageCodes(stage.stage)));
      const plannedNames = [...new Set([...current.stages.map(stage => stage.stage), ...defaultManualStages])];
      const future = plannedNames.filter(name => {
        const codes = stageCodes(name);
        return codes.length && codes[0] > lastCode && !existingActive.has(stageMergeKey(name));
      }).map(name => current.stages.find(stage => stageMergeKey(stage.stage) === stageMergeKey(name)) ?? emptyManualStage(name));
      const resolvedPartNo = partNos[0] || current.partNo;
      const matched = resolvedPartNo.trim().length >= 12 ? lookupPartNumber(resolvedPartNo) : null;
      const importedTotal = prefills.reduce((sum, item) => sum + item.quantity, 0);
      const totalQuantity = prefills.length > 1 && prefills.some(item => item.startsFromSmt)
        ? importedTotal : (current.evaluationId && current.quantity ? current.quantity : prefills[0].quantity || current.quantity);
      const lanes = [...new Set(prefills.map(item => item.lane).filter(Boolean))];
      const dates = prefills.map(item => item.planDateIn).filter(Boolean).sort();
      const mergedSplitLots = splitLots.length ? (() => {
        const rows = new Map(current.splitLots.map(row => [row.lotId, row]));
        for (const row of splitLots) {
          const previous = rows.get(row.lotId);
          rows.set(row.lotId, previous ? { ...previous, ...row, stages: { ...previous.stages, ...row.stages } } : row);
        }
        return [...rows.values()];
      })() : current.splitLots;
      return {
        ...current, smtLot: smtLots[0], lotCurrent: prefills.length > 1 ? smtLots[0] : prefills.at(-1)!.lotCurrent,
        partNo: resolvedPartNo, density: resolvedPartNo ? resolvedPartNo.slice(5, 8).toUpperCase() : current.density,
        product: matched?.product || current.product, formFactor: matched?.formFactor || current.formFactor,
        evaluationNo: matched?.no || current.evaluationNo, lane: lanes[0] || current.lane,
        quantity: totalQuantity, planDateIn: dates[0] || current.planDateIn,
        stages: recalculateManualStages([...active, ...future], totalQuantity),
        splitLots: mergedSplitLots,
      };
    });
    const warnings = prefills.flatMap(item => item.warnings);
    setSeeFileMessage(warnings.length ? warnings.join(" ") : `Đã đọc ${prefills.length} file SEE Lot và cập nhật nối tiếp công đoạn.`);
  };
  const handleSeeFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      if (files.some(file => !/\.xlsx$/i.test(file.name))) throw new Error("SEE Lot phải là file .xlsx.");
      const prefills = await Promise.all(files.map(file => parseSeeLotForManual(file)));
      applySeeLotPrefills(prefills);
      setSeeLotFiles(files);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể đọc file Excel.");
    } finally {
      setBusy(false);
    }
  };
  const openSeeUpdate = () => {
    setSeeUpdatePartNo(manualDraft.partNo);
    setSeeUpdateLotId(manualDraft.lotCurrent);
    setSeeUpdateRows(emptySeeUpdateRows());
    setError("");
    setSeeUpdateModal(true);
  };
  const updateSeeCell = (rowIndex: number, columnIndex: number, value: string) => setSeeUpdateRows(current => {
    const rows = current.map(row => [...row]);
    rows[rowIndex][columnIndex] = value;
    return rows;
  });
  const pasteSeeUpdateTable = (event: ClipboardEvent<HTMLInputElement>, startRow: number, startColumn: number) => {
    const clipboard = event.clipboardData.getData("text");
    if (!clipboard.includes("\t") && !clipboard.includes("\n")) return;
    event.preventDefault();
    const pasted = clipboard.replace(/\r/g, "").split("\n").filter((line, index, rows) => line.length || index < rows.length - 1)
      .map(line => line.split("\t"));
    setSeeUpdateRows(current => {
      const rows = current.map(row => [...row]);
      while (rows.length < startRow + pasted.length) rows.push(Array.from({ length: seeUpdateHeaders.length }, () => ""));
      pasted.forEach((source, rowOffset) => source.slice(0, seeUpdateHeaders.length - startColumn)
        .forEach((value, columnOffset) => { rows[startRow + rowOffset][startColumn + columnOffset] = value.trim(); }));
      return rows;
    });
  };
  const saveSeeUpdateData = () => {
    setError("");
    try {
      const prefill = parseSeeLotTableForManual(seeUpdatePartNo, seeUpdateLotId, seeUpdateRows);
      applySeeLotPrefills([prefill]);
      setSeeUpdateModal(false);
      setSeeFileMessage(`Đã lưu dữ liệu See Lot ${prefill.lotId}; Part No., Lot Current, SMT Lot và công đoạn đã được cập nhật.`);
    } catch (error) { setError(error instanceof Error ? error.message : "Không thể đọc dữ liệu See Lot."); }
  };
  const dropSeeFiles = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!busy) void handleSeeFiles(Array.from(event.dataTransfer.files ?? []));
  };
  const updateSplitLot = (index: number, key: keyof SplitLot, value: string) => setManualDraft(current => {
    const splitLots = current.splitLots.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row);
    const quantity = splitLots.reduce((sum, row) => sum + (Number(row.inputQty) || 0), 0) || current.quantity;
    return { ...current, splitLots, quantity, stages: key === "inputQty" || key === "failCode" ? recalculateManualStages(current.stages, quantity) : current.stages };
  });
  const updateSplitLotStage = (splitIndex: number, stageName: string, key: "equipment" | "trackIn" | "trackOut" | "inputQty" | "outputQty" | "failCode", value: string) => setManualDraft(current => {
    const stageKey = stageMergeKey(stageName);
    const isM031 = /M031|IARTS|ARTS/i.test(stageName);
    const splitLots = current.splitLots.map((row, rowIndex) => {
      if (rowIndex !== splitIndex) return row;
      const fallback = isM031 ? { equipment: row.equipment, trackIn: row.trackIn, trackOut: row.trackOut, inputQty: row.inputQty, outputQty: row.outputQty, failCode: row.failCode } : { equipment: "", trackIn: "", trackOut: "", inputQty: "", outputQty: "", failCode: "" };
      const nextStage = { ...fallback, ...(row.stages?.[stageKey] || {}), [key]: value };
      return { ...row, ...(isM031 ? nextStage : {}), stages: { ...(row.stages || {}), [stageKey]: nextStage } };
    });
    const rows = splitLots.map(row => row.stages?.[stageKey] || (isM031 ? row : null)).filter(Boolean) as Array<Omit<SplitLot, "lotId" | "stages">>;
    const timesIn = rows.map(row => row.trackIn).filter(Boolean).sort();
    const timesOut = rows.map(row => row.trackOut).filter(Boolean).sort();
    const aggregate = {
      equipment: [...new Set(rows.map(row => row.equipment).filter(Boolean))].join(", "),
      trackIn: timesIn[0] || "", trackOut: timesOut.at(-1) || "",
      inputQty: String(rows.reduce((sum, row) => sum + (Number(row.inputQty) || 0), 0) || ""),
      outputQty: String(rows.reduce((sum, row) => sum + (Number(row.outputQty) || 0), 0) || ""),
      failCode: rows.map(row => row.failCode).filter(Boolean).join(" "),
    };
    const stages = current.stages.map(stage => stageMergeKey(stage.stage) === stageKey ? { ...stage, ...aggregate } : stage);
    const quantity = isM031 && Number(aggregate.inputQty) > 0 ? Number(aggregate.inputQty) : current.quantity;
    return { ...current, splitLots, stages, quantity };
  });
  const updateManualStage = (index: number, key: keyof ManualStage, value: string) =>
    setManualDraft((current) => {
      const changed = current.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, [key]: value } : stage,
      );
      const stages = ["trackIn", "failCode", "stage"].includes(key)
        ? recalculateManualStages(changed, current.quantity)
        : changed;
      return { ...current, stages };
    });
  const updateRdtStage = (index: number, key: keyof RdtData, value: string) =>
    setManualDraft((current) => ({
      ...current,
      stages: current.stages.map((stage, stageIndex) => {
        if (stageIndex !== index) return stage;
        const nextRdt = { ...(stage.rdt || emptyRdtData()), [key]: value };
        return { ...stage, rdt: nextRdt };
      }),
    }));
  const insertManualStage = (index: number) =>
    setManualDraft((current) => ({
      ...current,
      stages: recalculateManualStages([
        ...current.stages.slice(0, index),
        emptyManualStage(""),
        ...current.stages.slice(index),
      ], current.quantity),
    }));
  const addManualStage = () => insertManualStage(manualDraft.stages.length);
  const removeManualStage = (index: number) =>
    setManualDraft((current) => ({
      ...current,
      stages: recalculateManualStages(current.stages.filter((_stage, stageIndex) => stageIndex !== index), current.quantity),
    }));
  const saveManual = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/evaluation/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(manualDraft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không thể lưu dữ liệu.");
      if (manualFromMassReport && !manualDraft.evaluationId) {
        setManualDraft((current) => ({ ...current, evaluationId: payload.evaluation.id }));
        const stages = Object.fromEntries(manualDraft.stages.filter((stage) => stage.stage && (stage.trackIn || stage.trackOut || stage.inputQty || stage.outputQty || stage.failCode || stage.equipment)).map((stage) => {
          const input = Math.max(0, Number(stage.inputQty) || 0), output = Math.max(0, Number(stage.outputQty) || 0), fail = failQtyFromScrapCode(stage.failCode);
          return [stage.stage, { equipment: stage.equipment, trackIn: stage.trackIn, trackOut: stage.trackOut, input, output, scrap: stage.failCode, fail, yield: input ? output / input * 100 : 0 }];
        }));
        await persistMassDraft({ id: null, evaluationNo: manualDraft.evaluationNo, evaluationType: manualDraft.evaluationType, classification: manualDraft.classification, product: manualDraft.product, formFactor: manualDraft.formFactor, startStep: manualDraft.stages[0]?.stage || defaultManualStages[0], partId: manualDraft.partNo.slice(0, 5), density: manualDraft.density, lane: manualDraft.lane, status: manualDraft.status, lots: [{ partNo: manualDraft.partNo, lotNo: manualDraft.lotCurrent, quantity: manualDraft.quantity, status: manualDraft.status, rawText: "", stages }] });
      }
      setManualModal(false);
      setManualFromMassReport(false);
      setNotice(
        manualDraft.evaluationId
          ? `Đã cập nhật thêm dữ liệu cho Lot ${payload.evaluation.lotNo}.`
          : `Đã tạo Lot ${payload.evaluation.lotNo} và ${payload.timelineItems} công đoạn Timeline.`,
      );
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không thể lưu dữ liệu thủ công.");
    } finally {
      setBusy(false);
    }
  };
  const openImport = () => {
    setImportPreview(null);
    setImportFile(null);
    setError("");
    setNotice("");
    setImportModal(true);
  };
  const selectExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    setImportPreview(null);
    setImportFile(file);
    try {
      setImportPreview(await parseEvaluationWorkbook(file));
    } catch (error) {
      setImportFile(null);
      setError(
        error instanceof Error ? error.message : "Không thể đọc file Excel.",
      );
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  const importExcel = async () => {
    if (!importPreview || !importFile) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/evaluation/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: importFile.name,
            evaluations: importPreview.evaluations,
          }),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setImportModal(false);
      setNotice(
        `Đã đồng bộ ${j.imported} Lot từ Excel · ${j.created} Lot mới · ${j.updated} Lot cập nhật · ${j.timelineItems} bước timeline.`,
      );
      await load();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Không thể nhập dữ liệu Excel.",
      );
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = () => {
    const head = [
      "No.",
      "Loại",
      "Nội dung đánh giá",
      "Lot No.",
      "Sản phẩm",
      "Density",
      "Part No.",
      "Số lượng",
      "Thiết bị",
      "Step",
      "PIC",
      "Ngày bắt đầu",
      "Hạn hoàn thành",
      "Tiến độ",
      "Trạng thái",
      "Kết quả",
      "Fail Qty",
      "Yield",
      "Ghi chú",
    ];
    const body = rows.map((x) => [
      x.evaluationNo,
      x.evaluationType,
      x.evaluationContent,
      x.lotNo,
      x.product,
      x.density,
      x.partNo,
      x.quantity,
      x.equipment,
      x.step,
      x.owner,
      x.startDate,
      x.targetDate,
      x.progress,
      x.status,
      x.result,
      x.failQty,
      x.yieldRate,
      x.note,
    ]);
    const csv =
      "\uFEFF" +
      [head, ...body]
        .map((r) =>
          r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
        )
        .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `danh-gia-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  const exportEvaluationExcel = async (evaluation: Evaluation) => {
    setReportingId(evaluation.id);
    setError("");
    try {
      const [templateResponse, timelineResponse] = await Promise.all([
        fetch("/evaluation/template.xlsx"),
        fetch(`/api/evaluation/timeline?evaluationId=${evaluation.id}`),
      ]);
      if (!templateResponse.ok) throw new Error("Không tải được file Excel mẫu.");
      const timelinePayload = await timelineResponse.json();
      if (!timelineResponse.ok)
        throw new Error(timelinePayload.error || "Không tải được Timeline.");
      const report = buildEvaluationReport(
        new Uint8Array(await templateResponse.arrayBuffer()),
        evaluation,
        timelinePayload.timeline as TimelineItem[],
      );
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(report)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `HYV-SSD_ ${evaluationReportTitle(evaluation)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice(`Đã tạo báo cáo Excel cho Lot ${evaluation.lotNo}.`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Không thể tạo báo cáo Excel.",
      );
    } finally {
      setReportingId(null);
    }
  };

  const Stats = () => (
    <section className="stats-grid">
      <article>
        <div className="stat-icon blue-bg">▤</div>
        <div>
          <span>TỔNG ĐÁNH GIÁ</span>
          <strong>{String(stats.total).padStart(2, "0")}</strong>
          <small>Toàn bộ dữ liệu Lot</small>
        </div>
      </article>
      <article>
        <div className="stat-icon violet-bg">◔</div>
        <div>
          <span>ĐANG THỰC HIỆN</span>
          <strong>{String(stats.running).padStart(2, "0")}</strong>
          <small>
            {stats.total ? Math.round((stats.running / stats.total) * 100) : 0}%
            tổng số
          </small>
        </div>
      </article>
      <article>
        <div className="stat-icon orange-bg">!</div>
        <div>
          <span>HOLD / TRỄ HẠN</span>
          <strong>{String(stats.hold).padStart(2, "0")}</strong>
          <small className="warning">Cần xử lý sớm</small>
        </div>
      </article>
      <article>
        <div className="stat-icon green-bg">✓</div>
        <div>
          <span>HOÀN THÀNH</span>
          <strong>{String(stats.done).padStart(2, "0")}</strong>
          <small>
            <b>
              {stats.done ? Math.round((stats.pass / stats.done) * 100) : 0}%
            </b>{" "}
            đạt PASS
          </small>
        </div>
      </article>
    </section>
  );
  const OverviewMatrix = () => {
    const manualLots = data.filter((item) => item.note.includes("Nguồn: Nhập thủ công"));
    const sameStage = (first: string, second: string) => {
      const firstCodes = stageCodes(first), secondCodes = stageCodes(second);
      return firstCodes.length && secondCodes.length
        ? firstCodes.some((code) => secondCodes.includes(code))
        : first.trim().toLowerCase() === second.trim().toLowerCase();
    };
    const savedPlan = overviewLot
      ? noteValue(overviewLot.note, ["Manual Steps"]).split("|").map((stage) => stage.trim()).filter(Boolean)
      : [];
    const stagePlan = overviewLot?.note.includes("Manual Steps:") ? savedPlan : defaultManualStages;
    const actualStages = overviewTimeline
      .filter((item, index, items) => item.stage && items.findIndex((candidate) => sameStage(candidate.stage, item.stage)) === index)
      .map((item) => item.stage);
    const stages = !overviewLot
      ? defaultManualStages
      : (() => {
          if (!actualStages.length) return stagePlan;
          const visible = [...actualStages];
          const lastActualStage = actualStages.at(-1) || "";
          const lastPlanIndex = stagePlan.findIndex((stage) => sameStage(stage, lastActualStage));
          const remainingPlan = lastPlanIndex >= 0
            ? stagePlan.slice(lastPlanIndex + 1)
            : stagePlan.filter((stage) => !actualStages.some((actual) => sameStage(actual, stage)));
          remainingPlan.forEach((stage) => {
            if (!visible.some((shown) => sameStage(shown, stage))) visible.push(stage);
          });
          if (!visible.some((stage) => /PACK|M170/i.test(stage))) visible.push("Packing (M170)");
          return visible;
        })();
    const timelineForStage = (stage: string) => {
      const codes = stageCodes(stage);
      return overviewTimeline.find((item) => {
        const itemCodes = stageCodes(item.stage);
        return codes.length
          ? itemCodes.some((code) => codes.includes(code))
          : item.stage.trim().toLowerCase() === stage.trim().toLowerCase();
      });
    };
    function isTimelineDone(item?: TimelineItem) {
      return Boolean(item && (item.status === "Hoàn thành" || timelineTrackOut(item.note)));
    }
    const waitingIndex = overviewLot ? stages.findIndex((stage) => !isTimelineDone(timelineForStage(stage))) : -1;
    const currentQuantity = (() => {
      if (!overviewLot) return "";
      const currentItem = waitingIndex >= 0 ? timelineForStage(stages[waitingIndex]) : timelineForStage(stages.at(-1) || "");
      const currentInput = currentItem ? noteValue(currentItem.note, ["Input", "INPUT"]) : "";
      if (currentInput !== "") return currentInput;
      for (let index = (waitingIndex >= 0 ? waitingIndex : stages.length) - 1; index >= 0; index -= 1) {
        const item = timelineForStage(stages[index]);
        const output = item ? noteValue(item.note, ["Output", "OUTPUT"]) : "";
        if (output !== "") return output;
      }
      return String(overviewLot.quantity || "");
    })();
    const stageLabel = (stage: string) => {
      if (/SMT|M010|M015/i.test(stage)) return "SMT";
      if (/SOLDER|M026/i.test(stage)) return "M026";
      if (/IARTS|M031|ARTS/i.test(stage)) return "M031";
      if (/ROUTER|M033/i.test(stage)) return "M033";
      if (/CASING|M087|M120/i.test(stage)) return "CASING";
      if (/AGING|M100|M111/i.test(stage)) return "AGING";
      if (/LED|M125/i.test(stage)) return "M125";
      if (/INTERFACE|M130/i.test(stage)) return "M130";
      if (/AVI|M160/i.test(stage)) return "M160";
      if (/FVI|M164/i.test(stage)) return "M164";
      if (/BASIC|M165/i.test(stage)) return "M165";
      if (/PACK|M170/i.test(stage)) return "M170";
      const code = stage.match(/M\d{3}/i)?.[0];
      return code?.toUpperCase() || stage;
    };
    const metricValue = (item: TimelineItem | undefined, metric: string) => {
      if (!item) return ["Scrap code", "Q'ty Fail", "Yield"].includes(metric) ? "-" : "";
      const inputText = noteValue(item.note, ["Input", "INPUT"]);
      const outputText = noteValue(item.note, ["Output", "OUTPUT"]);
      if (metric === "EQP") return noteValue(item.note, ["EQP", "Equipment", "Machine"]);
      if (metric === "INPUT") return inputText;
      if (metric === "OUTPUT") return outputText;
      if (metric === "Scrap code") return noteValue(item.note, ["Fail code", "FAIL CODE"]) || "-";
      if (metric === "Q'ty Fail") {
        if (inputText === "" || outputText === "") return "-";
        const value = Math.max(0, Number(inputText) - Number(outputText));
        return value && value > 0 ? String(value) : "-";
      }
      if (metric === "Yield") {
        const input = Number(inputText), output = Number(outputText);
        return inputText !== "" && outputText !== "" && input > 0 ? `${(output / input * 100).toFixed(2)}%` : "-";
      }
      return "";
    };
    const selectSmtLot = (value: string) => {
      setOverviewSmtLot(value);
      const exact = manualLots.find(
        (item) => noteValue(item.note, ["SMT Lot"]).trim().toLowerCase() === value.trim().toLowerCase(),
      );
      if (exact) void showOverviewLot(exact);
    };
    return (
      <section className="overview-matrix-card">
        <div className="overview-lot-search">
          <div>
            <h3>Tổng quan dữ liệu đánh giá</h3>
            <span>Nhập SMT Lot để hiển thị toàn bộ dữ liệu thủ công</span>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); findOverviewLot(overviewSmtLot); }}>
            <input
              list="overview-smt-lots"
              value={overviewSmtLot}
              onChange={(event) => selectSmtLot(event.target.value)}
              placeholder="Nhập SMT Lot"
            />
            <datalist id="overview-smt-lots">
              {manualLots.map((item) => <option key={item.id} value={noteValue(item.note, ["SMT Lot"])} />)}
            </datalist>
            <button className="primary" type="submit" disabled={overviewBusy}>{overviewBusy ? "Đang tải..." : "Hiển thị"}</button>
          </form>
        </div>
        {overviewMessage && <div className="overview-message">{overviewMessage}</div>}
        <div className="overview-sheet">
          <div className="overview-info-scroll">
            <table className="overview-info-table">
              <tbody>
                <tr><th>{overviewLot?.evaluationType || "DOE"} No.</th><td>{overviewLot?.evaluationNo || ""}</td><th>Lot Current</th><td>{overviewLot?.lotNo || ""}</td><th>SMT Lot</th><td>{overviewLot ? noteValue(overviewLot.note, ["SMT Lot"]) : ""}</td><th>Plan Date</th><td>{overviewLot && fmtPlanDate(overviewLot.targetDate) !== "—" ? fmtPlanDate(overviewLot.targetDate) : ""}</td></tr>
                <tr><th>Eval Type</th><td>{overviewLot?.evaluationType || ""}</td><th>Part No</th><td>{overviewLot?.partNo || ""}</td><th>Current Step</th><td>{overviewLot ? (waitingIndex >= 0 ? stages[waitingIndex] : stages.at(-1) || overviewLot.currentStep || overviewLot.step) : ""}</td><th className="empty-label" /><td /></tr>
                <tr><th>Phân loại</th><td>{overviewLot?.evaluationContent || ""}</td><th>Q&apos;ty</th><td>{overviewLot?.quantity || ""}</td><th>Current Q&apos;ty</th><td>{currentQuantity}</td><th className="empty-label" /><td /></tr>
                <tr><th>Product / Model</th><td>{overviewLot?.product || ""}</td><th>Density</th><td>{overviewLot?.density || ""}</td><th>Status</th><td>{overviewLot ? (waitingIndex < 0 && stages.length ? "Done" : "Waiting") : ""}</td><th className="empty-label" /><td /></tr>
                <tr><th>Form Factor</th><td>{overviewLot?.formFactor || ""}</td><th>ASSY Lane</th><td>{overviewLot?.equipment || ""}</td><th className="empty-label" /><td /><th className="empty-label" /><td /></tr>
              </tbody>
            </table>
          </div>
          <div className="overview-stage-scroll">
            <table className="overview-stage-matrix">
              <thead><tr><th>Lot Current</th><th>Total Q&apos;ty</th><th>Data</th>{stages.map((stage, index) => <th key={`${stage}-${index}`}>{stageLabel(stage)}</th>)}</tr></thead>
              <tbody>
                {["EQP", "INPUT", "OUTPUT", "Scrap code", "Q'ty Fail", "Yield", "Status"].map((metric, metricIndex) => (
                  <tr key={metric}>
                    {metricIndex === 0 && <><td rowSpan={7}>{overviewLot?.lotNo || ""}</td><td rowSpan={7}>{overviewLot?.quantity || ""}</td></>}
                    <th>{metric}</th>
                    {stages.map((stage, index) => {
                      const item = timelineForStage(stage);
                      if (metric !== "Status") {
                        const value = metricValue(item, metric);
                        const input = Number(item ? noteValue(item.note, ["Input", "INPUT"]) : 0);
                        const output = Number(item ? noteValue(item.note, ["Output", "OUTPUT"]) : 0);
                        const failQuantity = input > 0 && output >= 0 ? Math.max(0, input - output) : 0;
                        const isFailure = metric === "Q'ty Fail"
                          ? Number(value) >= 1
                          : metric === "Scrap code" && value !== "-" && value !== "" && failQuantity >= 1;
                        return <td key={`${metric}-${stage}-${index}`} className={isFailure ? "matrix-failure" : ""}>{value}</td>;
                      }
                      const state = !overviewLot ? "future" : isTimelineDone(item) ? "done" : index === waitingIndex ? "waiting" : "future";
                      return <td key={`${metric}-${stage}-${index}`} className={`matrix-status ${state}`}>{state === "done" ? "Done" : state === "waiting" ? "Waiting" : "-"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!overviewLot && <small className="overview-sheet-hint">Nhập SMT Lot để tải dữ liệu vào bảng.</small>}
        </div>
      </section>
    );
  };
  const EvaluationNoOverview = () => {
    const newProductLabels: Record<string, string> = {
      DOE: "DOE", PFQ: "PFQ", PRQ: "PRQ", FQ: "FQ sản phẩm",
      "1K": "1K sản phẩm", "2K": "2K sản phẩm", "10K": "10K sản phẩm",
    };
    const typeRank = (value: string) => {
      const index = overviewEvaluationTypes.findIndex((type) => type.toLowerCase() === value.trim().toLowerCase());
      return index < 0 ? overviewEvaluationTypes.length : index;
    };
    const statusInfo = (evaluation: Evaluation) => {
      const value = evaluation.status.trim().toLowerCase();
      if (value.includes("hoàn thành") || evaluation.progress >= 100) {
        return { key: "done", label: "Hoàn thành" };
      }
      if (value.includes("hold") || value.includes("trễ")) {
        return { key: "hold", label: "Hold" };
      }
      if (value.includes("đang") || (evaluation.progress > 0 && evaluation.progress < 100)) {
        return { key: "running", label: "Đang thực hiện" };
      }
      return { key: "pending", label: "Chưa tiến hành" };
    };
    const isFqLane = (evaluation: Evaluation) => {
      const type = evaluation.evaluationType.trim().toLowerCase();
      const description = `${evaluation.evaluationContent || ""} ${evaluation.equipment || ""}`.toLowerCase();
      return type === "fq lane" || (type === "fq" && description.includes("lane"));
    };
    const isNewProduct = (evaluation: Evaluation) =>
      typeRank(evaluation.evaluationType) < overviewEvaluationTypes.length && !isFqLane(evaluation);
    const sortedEvaluations = [...data]
      .sort((first, second) => {
        const noOrder = (first.evaluationNo || "ZZZ").localeCompare(second.evaluationNo || "ZZZ", "vi", { numeric: true });
        return noOrder || typeRank(first.evaluationType) - typeRank(second.evaluationType) || first.id - second.id;
      });
    const visibleEvaluations = sortedEvaluations.filter(isNewProduct);
    const otherEvaluations = sortedEvaluations.filter((evaluation) => !isNewProduct(evaluation));
    const grouped = Array.from(
      visibleEvaluations.reduce((groups, evaluation) => {
        const key = evaluation.evaluationNo.trim() || "Chưa có No.";
        const current = groups.get(key) || [];
        current.push(evaluation);
        groups.set(key, current);
        return groups;
      }, new Map<string, Evaluation[]>()),
    );
    const searchKey = overviewQuery.trim().toLowerCase();
    const filteredGroups = grouped.filter(([evaluationNo, evaluations]) => {
      if (!searchKey) return false;
      return evaluationNo.toLowerCase().includes(searchKey) || evaluations.some((evaluation) => evaluation.evaluationNo.toLowerCase().includes(searchKey));
    });
    const otherSearchKey = overviewOtherQuery.trim().toLowerCase();
    const otherTypeLabel = (evaluation: Evaluation) => [isFqLane(evaluation) ? "FQ Lane" : evaluation.evaluationType || "Khác", evaluation.evaluationContent].filter(Boolean).join(" · ");
    const otherGeneralType = (evaluation: Evaluation) => evaluation.evaluationType.trim() || "Khác";
    const otherFilterOptions = Array.from(new Set(otherEvaluations.map(otherGeneralType))).sort((first, second) => first.localeCompare(second, "vi"));
    const filteredOthers = otherEvaluations.filter((evaluation) => !otherSearchKey || otherGeneralType(evaluation).toLowerCase() === otherSearchKey).sort((first, second) => {
      const otherRank = (evaluation: Evaluation) => {
        const type = evaluation.evaluationType.trim().toLowerCase();
        if (isFqLane(evaluation)) return 0;
        if (type === "pgm") return 1;
        if (type === "eqp") return 2;
        if (type === "eqp expansion" || type === "product expansion") return 3;
        return 4;
      };
      return otherRank(first) - otherRank(second)
        || first.evaluationType.localeCompare(second.evaluationType, "vi")
        || first.id - second.id;
    });
    const typeCounts = overviewEvaluationTypes.map((type) => ({
      type,
      count: visibleEvaluations.filter((item) => item.evaluationType.trim().toLowerCase() === type.toLowerCase()).length,
    }));
    const renderEvaluationCard = (evaluation: Evaluation) => {
      const state = statusInfo(evaluation);
      const smtLot = noteValue(evaluation.note, ["SMT Lot"]);
      return (
        <button
          key={evaluation.id}
          type="button"
          className={`overview-evaluation-card state-${state.key}`}
          onClick={() => void openEvaluationDetail(evaluation)}
          title="Mở thông tin chi tiết đánh giá"
        >
          <span className="overview-card-line"><b>Part No:</b>{evaluation.partNo || "-"}</span>
          <span className="overview-card-line"><b>SMT Lot:</b>{smtLot || "-"}</span>
          <span className="overview-card-line"><b>Q&apos;ty:</b>{fmtCount(evaluation.quantity)}ea</span>
          <span className={`overview-card-line overview-card-status ${state.key}`}><b>Trạng thái:</b>{evaluation.status || state.label}</span>
          <span className="overview-card-approval">{(evaluation.approvalStatus || "Chưa phê duyệt").toLowerCase()}</span>
          <span className="overview-card-line"><b>Actual Date In:</b>{evaluation.startDate ? fmtPlanDate(evaluation.startDate) : "-"}</span>
        </button>
      );
    };
    return (
      <section className="evaluation-no-overview">
        <div className="evaluation-no-toolbar">
          <div>
            <h3>Tiến độ đánh giá theo No.</h3>
            <p>Mỗi No. được sắp xếp DOE → PFQ → PRQ → FQ → 1K → 2K → 10K</p>
          </div>
        </div>
        <div className="overview-type-strip">
          {typeCounts.map(({ type, count }) => (
            <div key={type}><span>{type}</span><strong>{count}</strong></div>
          ))}
          <div className="overview-status-legend">
            <span><i className="done" />Hoàn thành</span>
            <span><i className="running" />Đang thực hiện</span>
            <span><i className="pending" />Chưa tiến hành</span>
            <span><i className="hold" />Hold</span>
          </div>
        </div>
        <div className="overview-section-title"><div><strong>New Product</strong><span>DOE, PFQ, PRQ, FQ, 1K, 2K và 10K sản phẩm</span></div><label className="overview-no-search"><span>⌕</span><select value={overviewQuery} onChange={(event) => setOverviewQuery(event.target.value)}>{overviewQuery && <option value={overviewQuery} hidden>{overviewQuery}</option>}<option value="">Chọn số No.</option>{grouped.filter(([evaluationNo]) => evaluationNo !== overviewQuery).map(([evaluationNo]) => <option key={evaluationNo} value={evaluationNo}>{evaluationNo}</option>)}</select></label></div>
        <div className="evaluation-no-table-wrap">
          <table className="evaluation-no-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Thông tin chung</th>
                {overviewEvaluationTypes.map((type) => <th key={type}>{newProductLabels[type]}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map(([evaluationNo, evaluations]) => {
                const reference = evaluations[0];
                return (
                  <tr key={evaluationNo}>
                    <td className="evaluation-no-cell"><strong>{evaluationNo}</strong><small>{evaluations.length} Lot</small></td>
                    <td className="evaluation-product-cell">
                      <strong>{reference.product || "-"}</strong>
                      <span>{[reference.formFactor, reference.density].filter(Boolean).join(" · ") || "-"}</span>
                      <small>{reference.partNo || "-"}</small>
                    </td>
                    {overviewEvaluationTypes.map((type) => {
                      const typeEvaluations = evaluations.filter((item) => item.evaluationType.trim().toLowerCase() === type.toLowerCase());
                      return (
                        <td key={`${evaluationNo}-${type}`} data-type={type} className={typeEvaluations.length ? "has-evaluation" : "no-evaluation"}>
                          {typeEvaluations.length ? typeEvaluations.map(renderEvaluationCard) : <span className="evaluation-not-created">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!filteredGroups.length && (
                <tr><td colSpan={9} className="overview-no-empty">{searchKey ? "Không có No. đánh giá phù hợp." : "Nhập số No. để hiển thị đầy đủ đánh giá New Product."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="overview-section-title other"><div><strong>Đánh giá khác</strong><span>FQ, PGM, EQP, Expansion và các loại nhập tự do</span></div><label className="overview-no-search"><span>⌕</span><select value={overviewOtherQuery} onChange={(event) => setOverviewOtherQuery(event.target.value)}>{overviewOtherQuery && <option value={overviewOtherQuery} hidden>{overviewOtherQuery}</option>}<option value="">Tất cả Eval Type</option>{otherFilterOptions.filter((type) => type !== overviewOtherQuery).map((type) => <option key={type} value={type}>{type}</option>)}</select></label></div>
        <div className="evaluation-no-table-wrap">
          <table className="evaluation-other-table">
            <thead><tr><th>Eval Type</th><th>No.</th><th>Product / Model</th><th>Thông tin đánh giá</th></tr></thead>
            <tbody>
              {filteredOthers.map((evaluation) => (
                <tr key={evaluation.id}>
                  <td><span className="overview-other-type">{otherTypeLabel(evaluation)}</span></td>
                  <td><strong>{evaluation.evaluationNo || "-"}</strong></td>
                  <td className="evaluation-product-cell"><strong>{evaluation.product || "-"}</strong><span>{[evaluation.formFactor, evaluation.density].filter(Boolean).join(" · ") || "-"}</span></td>
                  <td>{renderEvaluationCard(evaluation)}</td>
                </tr>
              ))}
              {!filteredOthers.length && <tr><td colSpan={4} className="overview-no-empty">Không có dữ liệu phù hợp.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    );
  };
  const EvaluationTypeSummary = () => {
    const today = new Date().toISOString().slice(0, 10);
    const summaryRows = [
      { key: "running", label: "Đang đánh giá", color: "violet" },
      { key: "done", label: "Hoàn thành", color: "green" },
      { key: "approval", label: "Chờ phê duyệt", color: "orange" },
      { key: "delay", label: "Delay", color: "red" },
    ];
    const summaryStatus = (item: Evaluation) => {
      if (item.targetDate && item.targetDate.slice(0, 10) < today && item.status !== "Hoàn thành") return "delay";
      if ((item.approvalStatus || "").toLowerCase().includes("chờ phê duyệt")) return "approval";
      if (item.status === "Hoàn thành") return "done";
      return "running";
    };
    return <div className="evaluation-summary-card overview-evaluation-summary">
      <div className="evaluation-list-section-title"><span>▣</span><strong>Tổng hợp theo Eval Type</strong></div>
      <div className="evaluation-summary-scroll"><table className="evaluation-summary-table">
        <thead><tr><th>Status / Eval</th>{listEvaluationTypes.map((type) => <th key={type}>{type}</th>)}<th>Tổng</th></tr></thead>
        <tbody>
          {summaryRows.map((summary) => {
            const summaryData = data.filter((item) => summaryStatus(item) === summary.key);
            return <tr key={summary.key}><th><i className={summary.color} />{summary.label}</th>{listEvaluationTypes.map((type) => <td key={type}>{summaryData.filter((item) => item.evaluationType === type).length || "-"}</td>)}<td><b>{summaryData.length}</b></td></tr>;
          })}
          <tr className="summary-total-row"><th>Total</th>{listEvaluationTypes.map((type) => <td key={type}><b>{data.filter((item) => item.evaluationType === type).length}</b></td>)}<td><b>{data.length}</b></td></tr>
        </tbody>
      </table></div>
    </div>;
  };
  const QualificationDashboard = () => {
    const coreTypes = ["DOE", "PFQ", "PRQ", "FQ", "1K", "2K", "10K"];
    const today = new Date().toISOString().slice(0, 10);
    const query = overviewQuery.trim().toLowerCase();
    const smtLotOf = (item: Evaluation) => noteValue(item.note, ["SMT Lot"]);
    const isDelayed = (item: Evaluation) => Boolean(item.targetDate && item.targetDate.slice(0, 10) < today && item.status !== "Hoàn thành");
    const stateOf = (item?: Evaluation) => {
      if (!item) return "not-started";
      if (isDelayed(item)) return "delay";
      if (item.status === "Hold") return "hold";
      if (item.status === "Hoàn thành" || item.progress >= 100) return "complete";
      return item.status.includes("Đang") || item.progress > 0 ? "running" : "not-started";
    };
    const labelOf = (state: string) => state === "complete" ? "Hoàn thành" : state === "running" ? "Đang đánh giá" : state === "hold" ? "Hold" : state === "delay" ? "Delay" : "Chưa tiến hành";
    const iconOf = (state: string) => state === "complete" ? "✓" : state === "running" ? "●" : state === "hold" ? "Ⅱ" : state === "delay" ? "×" : "○";
    const filtered = data.filter((item) => {
      const matchesText = !query || [item.evaluationNo, item.product, item.partNo, item.lotNo, smtLotOf(item)].some((value) => String(value || "").toLowerCase().includes(query));
      const date = item.targetDate?.slice(0, 10) || "";
      return matchesText && (!dashboardDateFrom || date >= dashboardDateFrom) && (!dashboardDateTo || date <= dashboardDateTo);
    });
    const dashboardStats = {
      total: filtered.length,
      running: filtered.filter((item) => stateOf(item) === "running").length,
      hold: filtered.filter((item) => stateOf(item) === "hold").length,
      complete: filtered.filter((item) => stateOf(item) === "complete").length,
      delay: filtered.filter((item) => stateOf(item) === "delay").length,
    };
    const groups = Array.from(filtered.reduce((map, item) => {
      const key = item.evaluationNo.trim() || "-";
      const values = map.get(key) || [];
      values.push(item);
      map.set(key, values);
      return map;
    }, new Map<string, Evaluation[]>())).sort(([first], [second]) => second.localeCompare(first, "vi", { numeric: true }));
    const summaryTypes = Array.from(new Set([...coreTypes, ...data.map((item) => item.evaluationType)])).filter(Boolean);
    const currentOf = (items: Evaluation[]) => [...items].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0];
    const summaryRows = [
      { key: "running", label: "Đang đánh giá" },
      { key: "complete", label: "Hoàn thành" },
      { key: "approval", label: "Chờ phê duyệt" },
      { key: "delay", label: "Delay" },
    ];
    const summaryMatch = (item: Evaluation, key: string) => key === "approval"
      ? (item.approvalStatus || "").toLowerCase().includes("chờ")
      : stateOf(item) === key;
    const activeLots = filtered.filter((item) => ["running", "hold", "delay"].includes(stateOf(item)));
    return <section className="qualification-dashboard">
      <div className="qualification-toolbar">
        <label className="qualification-search"><span>⌕</span><input value={overviewQuery} onChange={(event) => setOverviewQuery(event.target.value)} placeholder="Tìm Product No. / SMT Lot / No...." /></label>
        <div className="qualification-date-range"><input type="date" value={dashboardDateFrom} onChange={(event) => setDashboardDateFrom(event.target.value)} /><span>~</span><input type="date" value={dashboardDateTo} onChange={(event) => setDashboardDateTo(event.target.value)} /></div>
        <button type="button" className="qualification-filter-button">▽ Bộ lọc</button>
        <button type="button" className="qualification-refresh" onClick={() => { setOverviewQuery(""); setDashboardDateFrom(""); setDashboardDateTo(""); void load(); }}>↻</button>
      </div>

      <div className="qualification-kpis">
        {[
          ["total", "▱", "Tổng đánh giá", dashboardStats.total],
          ["running", "▶", "Đang đánh giá", dashboardStats.running],
          ["hold", "Ⅱ", "Hold", dashboardStats.hold],
          ["complete", "✓", "Hoàn thành", dashboardStats.complete],
          ["delay", "◷", "Delay", dashboardStats.delay],
        ].map(([key, icon, label, value]) => <article key={String(key)} className={`qualification-kpi ${key}`}><i>{icon}</i><div><span>{label}</span><strong>{value}</strong><small>{key === "total" ? "Tất cả" : `${dashboardStats.total ? (Number(value) / dashboardStats.total * 100).toFixed(1) : "0.0"}%`}</small></div></article>)}
      </div>

      <section className="qualification-card qualification-matrix-card">
        <header><div><h3>Ma trận đánh giá</h3><p>Theo thứ tự DOE → PFQ → PRQ → FQ → 1K → 2K → 10K</p></div><div className="qualification-legend">{[["complete","Hoàn thành"],["running","Đang đánh giá"],["hold","Hold"],["not-started","Chưa bắt đầu"],["delay","Delay"]].map(([state,label]) => <span key={state}><i className={state}>{iconOf(state)}</i>{label}</span>)}</div></header>
        <div className="qualification-table-scroll"><table className="qualification-matrix"><thead><tr><th>No.</th><th>Product</th><th>Product / Form Factor / Density</th>{coreTypes.map((type) => <th key={type}>{type}</th>)}<th>Lot hiện tại</th><th>Công đoạn</th><th>Trạng thái</th></tr></thead><tbody>
          {groups.map(([evaluationNo, items]) => { const current = currentOf(items); const overall = stateOf(current); return <tr key={evaluationNo}><td><b>{evaluationNo}</b></td><td><strong>{current.product || "-"}</strong></td><td><span>{[current.product, current.formFactor, current.density].filter(Boolean).join(" · ") || "-"}</span></td>{coreTypes.map((type) => { const item = items.find((entry) => entry.evaluationType.toUpperCase() === type); const state = stateOf(item); return <td key={type}><button type="button" disabled={!item} className={`matrix-state ${state}`} onClick={() => item && void openEvaluationDetail(item)} title={item ? `${item.lotNo} · ${translateDynamic(labelOf(state), language)}` : "Chưa có đánh giá"}>{iconOf(state)}</button></td>; })}<td><b>{overall === "complete" ? "Hoàn thành" : current.lotNo || "-"}</b></td><td>{overall === "complete" ? "-" : current.currentStep || current.step || "-"}</td><td><span className={`qualification-status ${overall}`}>{labelOf(overall)}</span></td></tr>; })}
          {!groups.length && <tr><td colSpan={13} className="qualification-empty">Không có dữ liệu phù hợp.</td></tr>}
        </tbody></table></div>
      </section>

      <section className="qualification-card qualification-summary-card">
        <header><h3>▣ Tổng hợp theo Eval Type</h3></header><div className="qualification-table-scroll"><table className="qualification-summary"><thead><tr><th>Status / Eval</th>{summaryTypes.map((type) => <th key={type}>{type}</th>)}<th>Tổng</th></tr></thead><tbody>{summaryRows.map((row) => { const items = filtered.filter((item) => summaryMatch(item, row.key)); return <tr key={row.key}><th><i className={row.key} />{row.label}</th>{summaryTypes.map((type) => <td key={type}>{items.filter((item) => item.evaluationType === type).length || "-"}</td>)}<td><b>{items.length}</b></td></tr>; })}<tr className="qualification-total"><th>Total</th>{summaryTypes.map((type) => <td key={type}><b>{filtered.filter((item) => item.evaluationType === type).length}</b></td>)}<td><b>{filtered.length}</b></td></tr></tbody></table></div>
      </section>

      <div className="qualification-lower-grid">
        <section className="qualification-card qualification-progress-board"><header><h3>Tiến độ theo loại đánh giá</h3></header><div className="qualification-progress-columns">{coreTypes.map((type) => { const items = filtered.filter((item) => item.evaluationType.toUpperCase() === type); return <article key={type}><h4>{type}</h4>{["running","hold","complete"].map((state) => { const values = items.filter((item) => stateOf(item) === state); return <div key={state} className={state}><b>{labelOf(state)} ({values.length})</b>{values.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => void openEvaluationDetail(item)}>• No.{item.evaluationNo || "-"} {item.product}</button>)}{!values.length && <span>-</span>}</div>; })}</article>; })}</div></section>
        <section className="qualification-card qualification-tracking"><header><h3>Lot Tracking <small>(Đang tiến hành)</small></h3></header><div className="qualification-table-scroll"><table><thead><tr><th>SMT Lot</th><th>Product</th><th>Eval Type</th><th>Current Step</th><th>Q&apos;ty Plan</th><th>Q&apos;ty Done</th><th>Progress</th><th>Status</th></tr></thead><tbody>{activeLots.slice(0, 8).map((item) => { const done = Math.round(item.quantity * Math.max(0, Math.min(100, item.yieldRate || 0)) / 100); const state = stateOf(item); return <tr key={item.id}><td><b>{smtLotOf(item) || "-"}</b></td><td>{item.product}</td><td>{item.evaluationType}</td><td>{item.currentStep || item.step || "-"}</td><td>{fmtCount(item.quantity)}</td><td>{fmtCount(done)}</td><td><span className="tracking-progress"><i style={{ width: `${Math.max(3, item.progress)}%` }} /></span><b>{item.progress}%</b></td><td><span className={`qualification-status ${state}`}>{labelOf(state)}</span></td></tr>; })}{!activeLots.length && <tr><td colSpan={8} className="qualification-empty">Không có Lot đang tiến hành.</td></tr>}</tbody></table></div></section>
      </div>
    </section>;
  };
  const NewProductEvaluation = () => {
    const evaluationOrder = ["DOE", "PFQ", "PRQ", "FQ", "1K", "2K", "10K"];
    const stageColumns = [
      ["SMT", "SMT (M010/M015)"], ["M026", "Soldering (M026)"], ["M031", "iARTs (M031)"],
      ["M033", "Router (M033)"], ["RDT", "RDT Test"], ["M045", "M045"],
      ["CASING", "Casing (M087/M120)"], ["AGING", "Aging (M100/M111)"], ["M125", "LED Test (M125)"],
      ["M130", "Interface (M130)"], ["M160", "AVI (M160)"], ["M164", "FVI (M164)"],
      ["M165", "Basic (M165)"], ["M170", "Packing (M170)"],
    ] as const;
    const today = new Date().toISOString().slice(0, 10);
    const normalizeType = (value: string) => {
      const normalized = value.trim().toUpperCase();
      if (/^D[0O]E\b/.test(normalized)) return "DOE";
      if (/^PFQ\b/.test(normalized)) return "PFQ";
      if (/^PRQ\b/.test(normalized)) return "PRQ";
      if (/^F\.?\s*Q\b/.test(normalized)) return "FQ";
      if (/^1K\b/.test(normalized)) return "1K";
      if (/^2K\b/.test(normalized)) return "2K";
      if (/^10K\b/.test(normalized)) return "10K";
      return normalized;
    };
    const stageKey = (value: string) => {
      const upper = value.toUpperCase();
      if (/M010|M015|SMT/.test(upper)) return "SMT";
      if (/M026|SOLDER/.test(upper)) return "M026";
      if (/M031|IARTS|ARTS/.test(upper)) return "M031";
      if (/M033|ROUTER/.test(upper)) return "M033";
      if (/RDT/.test(upper)) return "RDT";
      if (/M045/.test(upper)) return "M045";
      if (/M087|M120|CASING/.test(upper)) return "CASING";
      if (/M100|M111|AGING/.test(upper)) return "AGING";
      if (/M125|LED/.test(upper)) return "M125";
      if (/M130|INTERFACE/.test(upper)) return "M130";
      if (/M160|AVI/.test(upper)) return "M160";
      if (/M164|FVI/.test(upper)) return "M164";
      if (/M165|BASIC|AQL/.test(upper)) return "M165";
      if (/M170|PACK/.test(upper)) return "M170";
      return upper.replace(/[^A-Z0-9]/g, "");
    };
    const itemState = (item?: Evaluation) => {
      if (!item) return "not-started";
      if (item.status === "Delay") return "delay";
      if (item.status === "Hold") return "hold";
      if (item.status === "ISSUE") return "issue";
      if (item.status === "Pending") return "pending";
      if (item.status === "Hoàn thành" || item.progress >= 100) return "complete";
      if (item.status.includes("Đang") || item.progress > 0) return "running";
      if (item.targetDate && item.targetDate.slice(0, 10) < today) return "delay";
      return "not-started";
    };
    const newest = (items: Evaluation[]) => [...items].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0];
    const grouped = Array.from(data.reduce((map, item) => {
      const no = item.evaluationNo.trim();
      if (!no) return map;
      const items = map.get(no) || [];
      items.push(item);
      map.set(no, items);
      return map;
    }, new Map<string, Evaluation[]>()))
      .filter(([, items]) => items.some((item) => normalizeType(item.evaluationType) === "DOE"))
      .sort(([a], [b]) => a.localeCompare(b, "vi", { numeric: true }));
    const selectedNo = grouped.some(([no]) => no === newProductNo.trim()) ? newProductNo.trim() : "";
    const selectedItems = grouped.find(([no]) => no === selectedNo)?.[1] || [];
    const classificationKey = (item: Evaluation) => item.evaluationContent.trim().toUpperCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
    const isProductFlowItem = (item: Evaluation) => {
      const type = normalizeType(item.evaluationType);
      const classification = classificationKey(item);
      if (["DOE", "PFQ", "PRQ"].includes(type)) return classification.includes("NEW PRODUCT");
      if (type === "FQ") return classification.includes("LANE") || classification.includes("FQ PRODUCT") || classification === "PRODUCT";
      if (["1K", "2K", "10K"].includes(type)) return classification.includes("PRODUCT");
      return false;
    };
    const productFlowItems = selectedItems.filter(isProductFlowItem);
    const latestByType = (items: Evaluation[], type: string) => newest(items.filter((item) => normalizeType(item.evaluationType) === type));
    const currentEvaluation = (items: Evaluation[]) => newest(items);
    const groupState = (items: Evaluation[]) => {
      if (!items.length) return "not-started";
      const states = items.map((item) => itemState(item));
      if (states.includes("delay")) return "delay";
      if (states.includes("hold")) return "hold";
      return states.every((state) => state === "complete") ? "complete" : "running";
    };
    const stateLabel = (state: string) => state === "complete" ? "Hoàn thành" : state === "delay" ? "Delay" : state === "hold" ? "Hold" : "Đang đánh giá";
    const stateIcon = (state: string) => state === "complete" ? "✓" : ["delay", "issue", "hold", "pending"].includes(state) ? "×" : state === "running" ? "●" : "○";
    const reasonOf = (items: Evaluation[]) => {
      const state = groupState(items);
      if (state === "complete") return "-";
      if (state !== "delay" && state !== "hold") return "-";
      const current = currentEvaluation(items);
      return noteValue(current?.note || "", ["Status Reason"]) || current?.evaluationContent || current?.status || "-";
    };
    const processCell = (item: Evaluation, key: string) => {
      const planned = noteValue(item.note, ["Manual Steps"]).split("|").map((value) => stageKey(value)).filter(Boolean);
      const timeline = item.timelines || [];
      const entry = timeline.find((value) => stageKey(value.stage) === key);
      const inFlow = planned.includes(key) || Boolean(entry);
      if (!inFlow) return { text: "x", state: "excluded" };
      const hasData = (value?: TimelineItem) => Boolean(value && (timelineTrackIn(value.note) || timelineTrackOut(value.note) || noteValue(value.note, ["Input", "INPUT", "Output", "OUTPUT", "Fail code", "FAIL CODE", "RDT Total", "TC 50cyc", "Humidity 120hr"])));
      const currentKey = stageKey(item.currentStep || item.step || "");
      if (key === currentKey) {
        if (item.status === "ISSUE") return { text: "ISSUE", state: "issue" };
        if (item.status === "Hold") return { text: "Hold", state: "hold" };
        if (item.status === "Pending") return { text: "Pending", state: "pending" };
      }
      if (entry) {
        const input = noteValue(entry.note, ["Input", "INPUT"]);
        const failQty = Number(noteValue(entry.note, ["Fail Qty", "FAIL Q'TY"])) || 0;
        const failCode = noteValue(entry.note, ["Fail code", "FAIL CODE"]);
        if (failQty >= 1 || failCode) return { text: failQty >= 1 ? `${failQty}F/${input || item.quantity}` : failCode, state: "failed" };
        if (entry.status === "Hoàn thành" || timelineTrackOut(entry.note) || noteValue(entry.note, ["Output", "OUTPUT"])) return { text: "Done", state: "done" };
        if (hasData(entry)) return { text: "Waiting", state: "waiting" };
      }
      const stageIndex = planned.indexOf(key);
      const lastUpdatedIndex = timeline.reduce((last, value) => {
        const index = planned.indexOf(stageKey(value.stage));
        return hasData(value) && index >= 0 ? Math.max(last, index) : last;
      }, -1);
      if (key === currentKey && stageIndex === lastUpdatedIndex + 1) return { text: "Waiting", state: "waiting" };
      if (stageIndex > lastUpdatedIndex) return { text: "-", state: "future" };
      return { text: "x", state: "excluded" };
    };
    const detailSort = (a: Evaluation, b: Evaluation) => {
      const aOrder = evaluationOrder.indexOf(normalizeType(a.evaluationType));
      const bOrder = evaluationOrder.indexOf(normalizeType(b.evaluationType));
      const typeOrder = (aOrder < 0 ? 999 : aOrder) - (bOrder < 0 ? 999 : bOrder);
      return typeOrder || (a.startDate || a.createdAt).localeCompare(b.startDate || b.createdAt);
    };
    const newProductDetailTypes = new Set(["DOE", "PFQ", "PRQ", "FQ"]);
    const newProductDetailRows = selectedItems.filter((item) => newProductDetailTypes.has(normalizeType(item.evaluationType)) && isProductFlowItem(item)).sort(detailSort);
    const otherDetailRows = selectedItems.filter((item) => !(newProductDetailTypes.has(normalizeType(item.evaluationType)) && isProductFlowItem(item))).sort(detailSort);
    const columnsWithData = (items: Evaluation[]) => stageColumns.filter(([label]) =>
      items.some((item) => !["x", "-"].includes(processCell(item, label).text)));
    const newProductStageColumns = columnsWithData(newProductDetailRows);
    const otherStageColumns = columnsWithData(otherDetailRows);
    const variantGroups = Array.from(productFlowItems.reduce((map, item) => {
      const key = [item.product, item.formFactor, item.density].join("|");
      const values = map.get(key) || [];
      values.push(item);
      map.set(key, values);
      return map;
    }, new Map<string, Evaluation[]>()));
    const evalSummaryRows = [
      ["running", "Đang đánh giá"], ["complete", "Hoàn thành"], ["delay", "Delay"],
    ] as const;
    const summaryMatch = (item: Evaluation, state: string) => state === "running" ? itemState(item) === "running"
      : state === "delay" ? ["delay", "hold", "issue", "pending"].includes(itemState(item))
      : itemState(item) === state;
    const evalSummaryCounts = evalSummaryRows.map(([state]) => productFlowItems.filter((item) => summaryMatch(item, state)).length);
    const isApproved = (item: Evaluation) => (item.approvalStatus || "").trim().toLowerCase().startsWith("đã");
    const approvalSummaryRows = [["approved", "Đã phê duyệt"], ["approval", "Chờ phê duyệt"]] as const;
    const approvalMatch = (item: Evaluation, state: string) => state === "approved" ? isApproved(item) : !isApproved(item);
    const approvalSummaryCounts = approvalSummaryRows.map(([state]) => productFlowItems.filter((item) => approvalMatch(item, state)).length);
    const donutBackground = (counts: number[], colors: string[]) => {
      const total = Math.max(1, counts.reduce((sum, value) => sum + value, 0));
      let cursor = 0;
      const parts = counts.map((value, index) => {
        const start = cursor;
        cursor += value / total * 100;
        return `${colors[index]} ${start}% ${cursor}%`;
      });
      return { background: `conic-gradient(${parts.join(", ")})` } as CSSProperties;
    };
    const evalDonutStyle = donutBackground(evalSummaryCounts, ["#2497e3", "#16a66a", "#ef3b47"]);
    const approvalDonutStyle = donutBackground(approvalSummaryCounts, ["#16a66a", "#f0a62b"]);
    const detailReason = (item: Evaluation) => {
      if (["Hoàn thành", "Đang đánh giá"].includes(item.status)) return "-";
      const reason = noteValue(item.note, ["Status Reason"]);
      return reason || (["Hold", "ISSUE", "Pending"].includes(item.status) || itemState(item) === "delay" ? item.evaluationContent || item.status : "-");
    };
    const detailTable = (rows: Evaluation[], columns: typeof stageColumns, emptyText: string) => (
      <div className="new-product-table-scroll"><table className="new-product-detail-table"><thead><tr><th className="meta-head">Eval Type</th><th className="meta-head">Product</th><th className="meta-head">F/F</th><th className="meta-head classification-head">Phân loại</th><th className="meta-head">Density</th><th className="meta-head">Part No.</th><th className="meta-head">SMT Lot</th><th className="meta-head">Lot Current</th><th className="meta-head">Actual Date In</th>{columns.map(([label]) => <th className="stage-head" key={label}>{label}</th>)}<th className="status-head">Status</th><th className="reason-head">Reason</th></tr></thead><tbody>
        {rows.map((item) => { const statusState = itemState(item); return <tr key={item.id}><td><span className={`type-badge ${colors[item.evaluationType] || "blue"}`}>{item.evaluationType}</span></td><td><b>{item.product || "-"}</b></td><td>{item.formFactor || "-"}</td><td>{item.evaluationContent || "-"}</td><td>{item.density || "-"}</td><td title={item.partNo}>{item.partNo || "-"}</td><td>{noteValue(item.note, ["SMT Lot"]) || "-"}</td><td>{item.lotNo || "-"}</td><td>{fmtPlanDate(item.startDate)}</td>{columns.map(([label]) => { const cell = processCell(item, label); return <td key={label} className={`process-state-cell ${cell.state}`}>{cell.text}</td>; })}<td className={`new-product-detail-status ${statusState}`}><b>{item.status}</b><span>{item.approvalStatus || "Chưa phê duyệt"}</span></td><td className={["Hold", "ISSUE", "Pending"].includes(item.status) || statusState === "delay" ? "detail-reason issue" : "detail-reason"}>{detailReason(item)}</td></tr>; })}
        {!rows.length && <tr><td colSpan={11 + columns.length} className="new-product-empty">{emptyText}</td></tr>}
      </tbody></table></div>
    );
    return <section className="new-product-workspace">
      <section className="new-product-search-card">
        <strong>⌕ Tìm kiếm &amp; Lọc</strong><label><span>No.</span><div><input list="new-product-no-options" value={newProductNo} onChange={(event) => setNewProductNo(event.target.value)} placeholder="Chọn hoặc nhập No." /><datalist id="new-product-no-options">{grouped.map(([no]) => <option key={no} value={no} />)}</datalist><select aria-label="Chọn No. có sẵn" value={selectedNo} onChange={(event) => setNewProductNo(event.target.value)}><option value="">▼</option>{grouped.map(([no]) => <option key={no} value={no}>{no}</option>)}</select></div></label>{newProductNo && !selectedNo && <small>Chỉ hiển thị No. có chuỗi đánh giá bắt đầu từ DOE.</small>}
      </section>
      <section className="new-product-section progress-section"><div className="new-product-section-title"><strong>✧ Tiến độ đánh giá sản phẩm mới</strong><div className="new-product-legend">{[["complete","Hoàn thành"],["running","Đang đánh giá"],["delay","Delay"],["not-started","Chưa bắt đầu"]].map(([state,label]) => <span key={state}><i className={state}>{stateIcon(state)}</i>{label}</span>)}</div></div><div className="new-product-table-scroll"><table className="new-product-progress-table"><thead><tr><th className="head-product">Product</th><th className="head-form">F/F</th><th className="head-density">Density</th>{evaluationOrder.map((type) => <th className="head-eval" key={type}>{type}</th>)}<th className="head-current">Đánh giá hiện tại</th><th className="head-step">Công đoạn</th><th className="head-status">Trạng thái</th><th className="head-reason">Reason</th></tr></thead><tbody>
        {variantGroups.map(([key, items]) => { const current = currentEvaluation(items); const state = groupState(items); const shownStatus = current?.status || stateLabel(state); const special = ["Hold", "ISSUE", "Pending"].includes(shownStatus); const shownReason = shownStatus === "Đang đánh giá" ? "-" : special ? noteValue(current?.note || "", ["Status Reason"]) || "-" : reasonOf(items); return <tr key={key}><td><b>{current?.product || "-"}</b></td><td>{current?.formFactor || "-"}</td><td><b>{current?.density || "-"}</b></td>{evaluationOrder.map((type) => { const item = latestByType(items, type); const cellState = itemState(item); return <td key={type}><button type="button" disabled={!item} className={`new-product-state ${cellState}`} onClick={() => item && void openEvaluationDetail(item)}>{stateIcon(cellState)}</button></td>; })}<td><b>{current?.evaluationType || "-"}</b></td><td><b>{state === "complete" ? "-" : current?.currentStep || current?.step || "-"}</b></td><td><span className={`new-product-status ${special ? shownStatus.toLowerCase() : state}`}>{shownStatus}</span></td><td className={special || state === "delay" ? "new-product-reason issue" : "new-product-reason"}>{shownReason}</td></tr>; })}
        {!variantGroups.length && <tr><td colSpan={14} className="new-product-empty">Chọn hoặc nhập No. để hiển thị tiến độ.</td></tr>}
      </tbody></table></div></section>
      <div className="new-product-summary-grid">
        <section className="new-product-summary-section"><div className="summary-table-block"><div className="new-product-section-title"><strong>✧ Tổng hợp theo Eval Type</strong></div><table className="new-product-summary-table"><thead><tr><th>Status / Eval</th>{evaluationOrder.map((type) => <th key={type}>{type}</th>)}<th>Total</th></tr></thead><tbody>{evalSummaryRows.map(([state,label]) => <tr key={state}><th>{label}</th>{evaluationOrder.map((type) => <td key={type}>{productFlowItems.filter((item) => normalizeType(item.evaluationType) === type && summaryMatch(item,state)).length || "-"}</td>)}<td><b>{productFlowItems.filter((item) => summaryMatch(item,state)).length}</b></td></tr>)}<tr className="new-product-summary-total"><th>Total</th>{evaluationOrder.map((type) => <td key={type}><b>{productFlowItems.filter((item) => normalizeType(item.evaluationType) === type).length}</b></td>)}<td><b>{productFlowItems.length}</b></td></tr></tbody></table></div><div className="new-product-donut-card"><strong>TỶ LỆ THEO STATUS</strong><div><i className="new-product-donut" style={evalDonutStyle}><b>{productFlowItems.length}</b><span>Lot</span></i><ul>{evalSummaryRows.map(([state,label],index) => <li key={state} className={state}><i />{label}<b>{productFlowItems.length ? (evalSummaryCounts[index] / productFlowItems.length * 100).toFixed(1) : "0.0"}%</b></li>)}</ul></div></div></section>
        <section className="new-product-summary-section approval-summary"><div className="summary-table-block"><div className="new-product-section-title"><strong>✧ Tổng hợp tình trạng phê duyệt</strong></div><table className="new-product-summary-table"><thead><tr><th>Status / Eval</th>{evaluationOrder.map((type) => <th key={type}>{type}</th>)}<th>Total</th></tr></thead><tbody>{approvalSummaryRows.map(([state,label]) => <tr key={state}><th>{label}</th>{evaluationOrder.map((type) => <td key={type}>{productFlowItems.filter((item) => normalizeType(item.evaluationType) === type && approvalMatch(item,state)).length || "-"}</td>)}<td><b>{productFlowItems.filter((item) => approvalMatch(item,state)).length}</b></td></tr>)}<tr className="new-product-summary-total"><th>Total</th>{evaluationOrder.map((type) => <td key={type}><b>{productFlowItems.filter((item) => normalizeType(item.evaluationType) === type).length}</b></td>)}<td><b>{productFlowItems.length}</b></td></tr></tbody></table></div><div className="new-product-donut-card"><strong>TỶ LỆ PHÊ DUYỆT</strong><div><i className="new-product-donut" style={approvalDonutStyle}><b>{productFlowItems.length}</b><span>Lot</span></i><ul>{approvalSummaryRows.map(([state,label],index) => <li key={state} className={state}><i />{label}<b>{productFlowItems.length ? (approvalSummaryCounts[index] / productFlowItems.length * 100).toFixed(1) : "0.0"}%</b></li>)}</ul></div></div></section>
      </div>
      <section className="new-product-section detail-section"><div className="new-product-section-title"><strong>✧ {selectedNo ? `Chi tiết đánh giá sản phẩm mới No. ${selectedNo}` : "Chi tiết đánh giá sản phẩm mới No."}</strong><span>DOE · PFQ · PRQ · FQ</span></div>
        {detailTable(newProductDetailRows, newProductStageColumns, "Chọn hoặc nhập No. có dữ liệu DOE để xem chi tiết đánh giá sản phẩm mới.")}
      </section>
      <section className="new-product-section detail-section other-evaluation-detail"><div className="new-product-section-title"><strong>✧ {selectedNo ? `Chi tiết các đánh giá khác No. ${selectedNo}` : "Chi tiết các đánh giá khác No."}</strong><span>Các loại đánh giá còn lại</span></div>
        {detailTable(otherDetailRows, otherStageColumns, "Không có đánh giá khác thuộc No. đã chọn.")}
      </section>
    </section>;
  };
  const EvaluationTable = () => {
    const statusOptions = Array.from(new Set([...data.map((item) => item.status), ...massReports.map((item) => item.status)].filter(Boolean)));
    const pageWindowStart = Math.min(Math.max(1, safeListPage), Math.max(1, listPageCount - 1));
    const visiblePages = Array.from({ length: Math.min(2, listPageCount) }, (_item, index) => pageWindowStart + index);
    const resetFilters = () => {
      setListFilters({ evaluationNo: "", evaluationType: "", classification: "", product: "", formFactor: "", status: "", currentStep: "", smtLot: "", lotCurrent: "", partNo: "", dateFrom: "", dateTo: "" });
      setListStatusDraft("");
      setTab("Tất cả");
      setListPage(1);
    };
    return (
      <section className="panel evaluation-list-panel">
        <div className="evaluation-filter-card">
          <div className="evaluation-list-section-title"><span>▽</span><strong>Tìm kiếm &amp; lọc</strong><button type="button" onClick={resetFilters}>Reset ↻</button></div>
          <div className="evaluation-filter-grid">
            <label><span>No</span><select value={listFilters.evaluationNo} onChange={(event) => setListFilter("evaluationNo", event.target.value)}><option value="">Tất cả</option>{listEvaluationNos.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Eval Type</span><select value={listFilters.evaluationType} onChange={(event) => setListFilter("evaluationType", event.target.value)}><option value="">Tất cả</option>{listEvaluationTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label><span>Phân loại</span><select value={listFilters.classification} onChange={(event) => setListFilter("classification", event.target.value)}><option value="">Tất cả</option>{listClassifications.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Product</span><select value={listFilters.product} onChange={(event) => setListFilter("product", event.target.value)}><option value="">Chọn product</option>{listProducts.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>Form Factor</span><select value={listFilters.formFactor} onChange={(event) => setListFilter("formFactor", event.target.value)}><option value="">Tất cả</option>{listFormFactors.map((value) => <option key={value}>{value}</option>)}</select></label>
            <div className="status-multi-field"><span>Status</span><div className={`status-multi-select ${listStatusOpen ? "open" : ""}`}><button type="button" className="status-multi-trigger" onClick={() => { setListStatusOpen((open) => { if (!open) setListStatusDraft(listFilters.status); return !open; }); }}>{listFilters.status ? listFilters.status.split("|").join(", ") : "Tất cả"}<b>⌄</b></button>{listStatusOpen && <div className="status-multi-menu"><label><input type="checkbox" checked={!listStatusDraft} onChange={() => setListStatusDraft("")} /><strong>(Select All)</strong></label>{statusOptions.map((value) => { const selected = listStatusDraft.split("|").filter(Boolean); const checked = selected.includes(value); return <label key={value}><input type="checkbox" checked={checked} onChange={() => setListStatusDraft((checked ? selected.filter((item)=>item!==value) : [...selected,value]).join("|"))} /><span>{value}</span></label>; })}<div className="status-multi-actions"><button type="button" onClick={()=>{setListFilter("status",listStatusDraft);setListStatusOpen(false);}}>OK</button></div></div>}</div></div>
            <label><span>Current Step</span><select value={listFilters.currentStep} onChange={(event) => setListFilter("currentStep", event.target.value)}><option value="">Tất cả</option>{listSteps.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label><span>SMT LOT</span><input value={listFilters.smtLot} onChange={(event) => setListFilter("smtLot", event.target.value)} placeholder="Nhập SMT LOT" /></label>
            <label><span>LOT CURRENT</span><input value={listFilters.lotCurrent} onChange={(event) => setListFilter("lotCurrent", event.target.value)} placeholder="Nhập LOT CURRENT" /></label>
            <label><span>PART NO.</span><input value={listFilters.partNo} onChange={(event) => setListFilter("partNo", event.target.value)} placeholder="Nhập PART NO." /></label>
            <label className="date-filter"><span>Ngày kế hoạch</span><div><input type="date" value={listFilters.dateFrom} onChange={(event) => setListFilter("dateFrom", event.target.value)} /><b>→</b><input type="date" value={listFilters.dateTo} onChange={(event) => setListFilter("dateTo", event.target.value)} /></div></label>
            <button type="button" className="evaluation-search-button" onClick={() => setListPage(1)}>⌕ Tìm kiếm</button>
          </div>
        </div>

        <div className="evaluation-type-tabs">
          {["Tất cả", ...listEvaluationTypes].map((type) => <button key={type} type="button" className={tab === type ? "active" : ""} onClick={() => { setTab(type); setListPage(1); }}>{type}<b>{type === "Tất cả" ? data.length + massReports.length : data.filter((item) => item.evaluationType === type).length + massReports.filter((item) => item.evaluationType === type).length}</b></button>)}
        </div>

        <div className="table-wrap evaluation-list-scroll">
          <table className="evaluation-list-table redesigned">
            <thead><tr><th>No</th><th>Eval Type</th><th>Product</th><th>Form Factor</th><th>Phân loại</th><th>Part No.</th><th>SMT LOT</th><th>Lot Current</th><th>Total Q&apos;ty</th><th>Plan Date</th><th>Status</th><th>Current Step</th><th>Thao tác</th></tr></thead>
            <tbody>
              {pageRows.map((entry) => entry.kind === "evaluation" ? (() => { const x = entry.item; return <tr key={`evaluation-${x.id}`}>
                <td><strong>{x.evaluationNo || "-"}</strong></td>
                <td><span className={`type-badge ${colors[x.evaluationType] || "blue"}`}>{x.evaluationType}</span></td>
                <td><strong>{x.product || "-"}</strong></td>
                <td><strong>{x.formFactor || "-"}</strong></td>
                <td>{x.evaluationContent || "-"}</td>
                <td><strong title={x.partNo}>{x.partNo || "-"}</strong></td>
                <td><strong>{noteValue(x.note, ["SMT Lot"]) || "-"}</strong></td>
                <td><button type="button" className="evaluation-form-link" onClick={() => void openEvaluationDetail(x)}>{x.lotNo || "-"}</button></td>
                <td><strong>{fmtCount(x.quantity)}</strong></td>
                <td><strong>{fmtPlanDate(x.targetDate)}</strong></td>
                <td><span className={`status ${x.status.replaceAll(" ", "-").toLowerCase()}`}><i />{x.status}</span><small>{x.approvalStatus || "Chưa phê duyệt"}</small></td>
                <td><strong>{x.currentStep || x.step || "-"}</strong></td>
                <td><div className="row-actions">
                  {canEdit && <button className="update-data-button" onClick={() => void openManualUpdate(x)} disabled={busy}>Update</button>}
                  <button className="report-excel-button" onClick={() => void exportEvaluationExcel(x)} disabled={reportingId === x.id}>{reportingId === x.id ? "Đang tạo..." : "Excel Report"}</button>
                  <button className="timeline-button" onClick={() => void openTimeline(x)}>Timeline</button>
                  {canEdit && <button className="delete-button" onClick={() => void deleteEvaluation(x)} disabled={busy}>Xóa</button>}
                </div></td>
              </tr>; })() : (() => { const report = entry.item; const partNos = [...new Set(report.lots.map((lot) => lot.partNo).filter(Boolean))]; const lotNos = report.lots.map((lot) => lot.lotNo).filter(Boolean); return <tr key={`report-${report.id}`} className="mass-report-list-row">
                <td><strong>{report.evaluationNo || "-"}</strong></td>
                <td><span className={`type-badge ${colors[report.evaluationType] || "blue"}`}>{report.evaluationType}</span></td>
                <td><strong>{report.product || "-"}</strong></td>
                <td><strong>{report.formFactor || "-"}</strong></td>
                <td>{report.classification || "-"}</td>
                <td className="combined-report-parts" title={partNos.join(", ")}>{partNos.join(", ") || "-"}</td>
                <td>-</td>
                <td title={lotNos.join(", ")}><strong>{lotNos.length ? `${lotNos.length} Lot` : "-"}</strong></td>
                <td><strong>{fmtCount(report.quantity)}</strong></td>
                <td><strong>{fmtPlanDate(report.updatedAt)}</strong></td>
                <td><span className={`status ${report.status.replaceAll(" ", "-").toLowerCase()}`}><i />{report.status}</span><small>{report.reason || "-"}</small></td>
                <td><strong>{report.startStep || "-"}</strong></td>
                <td><div className="row-actions mass-list-actions">
                  {canEdit && <button type="button" className="update-data-button" onClick={() => openExistingMassReport(report)}>Update</button>}
                  <button type="button" className="report-excel-button" onClick={() => exportMassReport(report)}>Excel Report</button>
                  {canEdit && <button type="button" className="delete-button" disabled={deletingMassId === report.id} onClick={() => void deleteMassReport(report)}>{deletingMassId === report.id ? "Đang xóa..." : "Xóa"}</button>}
                </div></td>
              </tr>; })())}
            </tbody>
          </table>
          {!loading && !rows.length && <div className="empty"><strong>{data.length ? "Không tìm thấy Lot phù hợp" : "Chưa có Lot đánh giá"}</strong><span>{data.length ? "Hãy thay đổi bộ lọc." : "Nhấn “Nhập file Excel” để bắt đầu."}</span></div>}
        </div>
        <footer className="evaluation-list-footer">
          <span>{`Hiển thị ${rows.length ? (safeListPage - 1) * listPageSize + 1 : 0} - ${Math.min(safeListPage * listPageSize, rows.length)} của ${rows.length} bản ghi`}</span>
          <label>Hiển thị <select value={listPageSize} onChange={(event) => { setListPageSize(Number(event.target.value)); setListPage(1); }}><option>10</option><option>20</option><option>50</option></select> bản ghi / trang</label>
          <nav className="evaluation-pagination"><button disabled={safeListPage === 1} onClick={() => setListPage(Math.max(1, safeListPage - 1))}>←</button>{visiblePages.map((page) => <button key={page} className={page === safeListPage ? "active" : ""} onClick={() => setListPage(page)}>{page}</button>)}<button disabled={safeListPage === listPageCount} onClick={() => setListPage(Math.min(listPageCount, safeListPage + 1))}>→</button></nav>
        </footer>
      </section>
    );
  };

  const MassReportsView = () => {
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
    const reportPartNos = (report: MassReport) => unique(report.lots.map((lot) => lot.partNo));
    const reportTypes = unique([...massEvaluationTypes, ...massReports.map((report) => report.evaluationType)]);
    const filterOptions = {
      evaluationNo: unique(massReports.map((report) => report.evaluationNo)),
      evaluationType: reportTypes,
      classification: unique(massReports.map((report) => report.classification)),
      product: unique(massReports.map((report) => report.product)),
      formFactor: unique(massReports.map((report) => report.formFactor)),
      status: unique(massReports.map((report) => report.status)),
      partNo: unique(massReports.flatMap(reportPartNos)),
    };
    const filtered = massReports.filter((report) => {
      const match = (filter: string, value: string) => !filter || value.toLowerCase().includes(filter.toLowerCase());
      const selectedStatuses = massFilters.status.split("|").filter(Boolean);
      return (massTab === "Tất cả" || report.evaluationType === massTab)
        && match(massFilters.evaluationNo, report.evaluationNo) && match(massFilters.evaluationType, report.evaluationType)
        && match(massFilters.classification, report.classification) && match(massFilters.product, report.product)
        && match(massFilters.formFactor, report.formFactor) && (!selectedStatuses.length || selectedStatuses.includes(report.status))
        && match(massFilters.partNo, reportPartNos(report).join(", "));
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / massPageSize));
    const safePage = Math.min(massPage, pageCount);
    const pageRows = filtered.slice((safePage - 1) * massPageSize, safePage * massPageSize);
    const pageWindowStart = Math.min(Math.max(1, safePage), Math.max(1, pageCount - 1));
    const visiblePages = Array.from({ length: Math.min(2, pageCount) }, (_item, index) => pageWindowStart + index);
    const setMassFilter = (key: keyof typeof massFilters, value: string) => { setMassFilters((current) => ({ ...current, [key]: value })); setMassPage(1); };
    const resetMassFilters = () => { setMassFilters({ evaluationNo: "", evaluationType: "", classification: "", product: "", formFactor: "", status: "", partNo: "" }); setMassTab("Tất cả"); setMassPage(1); };
    return <section className="panel evaluation-list-panel mass-report-page">
      <div className="evaluation-filter-card">
        <div className="evaluation-list-section-title"><span>▽</span><strong>Tìm kiếm &amp; lọc</strong><div className="mass-filter-title-actions"><button type="button" onClick={resetMassFilters}>Reset ↻</button>{canEdit && <button className="primary mass-create-report" type="button" onClick={openNewMassReport}>＋ Tạo Lot mới</button>}</div></div>
        <div className="evaluation-filter-grid mass-report-filter-grid">
          {([['evaluationNo','No.'],['evaluationType','Eval Type'],['classification','Phân loại'],['product','Product'],['formFactor','Form Factor']] as const).map(([key,label]) => <label key={key}><span>{label}</span><select value={massFilters[key]} onChange={(event) => setMassFilter(key,event.target.value)}><option value="">{key === "product" ? "Chọn product" : "Tất cả"}</option>{filterOptions[key].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
          <div className="status-multi-field"><span>Status</span><details className="status-multi-select"><summary>{massFilters.status ? massFilters.status.split("|").join(", ") : "Tất cả"}<b>⌄</b></summary><div className="status-multi-menu"><label><input type="checkbox" checked={!massFilters.status} onChange={() => setMassFilter("status", "")} /><strong>(Select All)</strong></label>{filterOptions.status.map((value) => { const selected=massFilters.status.split("|").filter(Boolean); const checked=selected.includes(value); return <label key={value}><input type="checkbox" checked={checked} onChange={()=>setMassFilter("status",(checked?selected.filter((item)=>item!==value):[...selected,value]).join("|"))}/><span>{value}</span></label>; })}</div></details></div>
          <label><span>Part No.</span><select value={massFilters.partNo} onChange={(event) => setMassFilter("partNo",event.target.value)}><option value="">Tất cả</option>{filterOptions.partNo.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
          <button type="button" className="evaluation-search-button" onClick={() => setMassPage(1)}>⌕ Tìm kiếm</button>
        </div>
      </div>
      <div className="evaluation-type-tabs mass-report-tabs">{["Tất cả",...reportTypes].map((type)=><button key={type} type="button" className={massTab===type?"active":""} onClick={()=>{setMassTab(type);setMassPage(1);}}>{type}<b>{type==="Tất cả"?massReports.length:massReports.filter((report)=>report.evaluationType===type).length}</b></button>)}</div>
      <div className="table-wrap evaluation-list-scroll mass-report-list-wrap"><table className="evaluation-list-table redesigned mass-report-list"><thead><tr><th>No.</th><th>Eval Type</th><th>Product</th><th>Form Factor</th><th>Phân loại</th><th>Density</th><th>Part No.</th><th>Start Step</th><th>Q&apos;ty</th><th>Status</th><th>Thao tác</th></tr></thead><tbody>
        {pageRows.map((report) => <tr key={report.id}><td><strong>{report.evaluationNo || "-"}</strong></td><td><span className={`type-badge ${colors[report.evaluationType] || "blue"}`}>{report.evaluationType}</span></td><td><strong>{report.product || "-"}</strong></td><td><strong>{report.formFactor || "-"}</strong></td><td>{report.classification || "-"}</td><td>{report.density.split(", ").map((density,index)=><div key={index}>{density}</div>)}</td><td className="mass-part-nos">{reportPartNos(report).map((partNo)=><div key={partNo}>{partNo}</div>)}</td><td><strong>{report.startStep || "-"}</strong></td><td><strong>{fmtCount(report.quantity)}</strong></td><td><span className={`status ${report.status.replaceAll(" ", "-").toLowerCase()}`}><i />{report.status}</span></td><td><div className="row-actions mass-list-actions">{canEdit && <button type="button" className="update-data-button" onClick={() => openExistingMassReport(report)}>Update</button>}<button type="button" className="report-excel-button" onClick={() => exportMassReport(report)}>Excel Report</button>{canEdit && <button type="button" className="delete-button" disabled={deletingMassId === report.id} onClick={() => void deleteMassReport(report)}>{deletingMassId === report.id ? "Đang xóa..." : "Xóa"}</button>}</div></td></tr>)}
        {!pageRows.length && <tr><td colSpan={11} className="empty-row">{massReports.length ? "Không tìm thấy báo cáo phù hợp." : "Chưa có báo cáo 1K · 2K · 5K · 10K."}</td></tr>}
      </tbody></table></div>
      <footer className="evaluation-list-footer"><span>{`Hiển thị ${filtered.length?(safePage-1)*massPageSize+1:0} - ${Math.min(safePage*massPageSize,filtered.length)} của ${filtered.length} bản ghi`}</span><label>Hiển thị <select value={massPageSize} onChange={(event)=>{setMassPageSize(Number(event.target.value));setMassPage(1);}}><option>10</option><option>20</option><option>50</option></select> bản ghi / trang</label><nav className="evaluation-pagination"><button disabled={safePage===1} onClick={()=>setMassPage(Math.max(1,safePage-1))}>←</button>{visiblePages.map((page)=><button key={page} className={page===safePage?"active":""} onClick={()=>setMassPage(page)}>{page}</button>)}<button disabled={safePage===pageCount} onClick={()=>setMassPage(Math.min(pageCount,safePage+1))}>→</button></nav></footer>
    </section>;
  };
  const HistoryView = () => (
    <section className="panel history-panel">
      <div className="panel-heading">
        <div>
          <h3>Nhật ký hoạt động</h3>
          <span>{`${history.length} cập nhật gần nhất`}</span>
        </div>
        <button className="export-button" onClick={() => void load()}>
          ↻ Làm mới
        </button>
      </div>
      <div className="history-list">
        {history.map((h) => (
          <article key={h.id}>
            <div
              className={`history-icon ${h.action === "Xóa" ? "deleted" : h.action === "Tạo mới" ? "created" : "updated"}`}
            >
              {h.action === "Xóa" ? "×" : h.action === "Tạo mới" ? "+" : "↻"}
            </div>
            <div>
              <div className="history-title">
                <span className={`type-badge ${colors[h.evaluationType]}`}>
                  {h.evaluationType}
                </span>
                <strong>
                  {h.action} · {h.lotNo}
                </strong>
              </div>
              <p>{h.detail}</p>
              <small>
                {h.actor} · {fmtTime(h.createdAt)}
              </small>
            </div>
          </article>
        ))}
        {!history.length && !loading && (
          <div className="empty">
            <strong>Chưa có lịch sử cập nhật</strong>
            <span>
              Hoạt động tạo mới, chỉnh sửa và xóa Lot sẽ hiển thị tại đây.
            </span>
          </div>
        )}
      </div>
    </section>
  );
  const ReportsView = () => (
    <>
      <Stats />
      <section className="report-grid">
        <article className="panel report-card">
          <div className="panel-heading">
            <div>
              <h3>Theo loại đánh giá</h3>
              <span>Tỷ trọng DOE, PFQ, PRQ và FQ</span>
            </div>
          </div>
          <div className="report-bars">
            {evaluationTypes.map((t) => {
              const n = data.filter((x) => x.evaluationType === t).length,
                p = stats.total ? Math.round((n / stats.total) * 100) : 0;
              return (
                <div key={t}>
                  <span>
                    <b>{t}</b>
                    <small>
                      {n} Lot · {p}%
                    </small>
                  </span>
                  <div>
                    <i className={colors[t]} style={{ width: `${p}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
        <article className="panel report-card">
          <div className="panel-heading">
            <div>
              <h3>Kết quả đánh giá</h3>
              <span>Tình trạng PASS / FAIL</span>
            </div>
          </div>
          <div className="result-summary">
            <div
              className="result-ring"
              style={
                {
                  "--pass": `${stats.total ? Math.round((stats.pass / stats.total) * 100) : 0}%`,
                } as CSSProperties
              }
            >
              <strong>
                {stats.total ? Math.round((stats.pass / stats.total) * 100) : 0}
                %
              </strong>
              <small>PASS</small>
            </div>
            <ul>
              <li>
                <i className="pass" />
                PASS <b>{stats.pass}</b>
              </li>
              <li>
                <i className="fail" />
                FAIL <b>{data.filter((x) => x.result === "FAIL").length}</b>
              </li>
              <li>
                <i className="pending" />
                Chưa có kết quả{" "}
                <b>{data.filter((x) => x.result === "-").length}</b>
              </li>
            </ul>
          </div>
        </article>
      </section>
    </>
  );

  const UsersView = () => (
    <section className="panel account-panel">
      <div className="panel-heading">
        <div>
          <h3>Danh sách tài khoản</h3>
          <span>
            {users.filter((u) => u.status === "pending").length} yêu cầu đang
            chờ duyệt
          </span>
        </div>
        <button className="export-button" onClick={() => void load()}>
          ↻ Làm mới
        </button>
      </div>
      <div className="account-list">
        {users.map((u) => (
          <article key={u.id}>
            <div className="account-avatar">
              {u.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="account-info">
              <strong>{u.username || u.displayName}</strong>
              <span>Tên đăng nhập</span>
            </div>
            <span className={`account-state ${u.status}`}>
              {u.status === "pending"
                ? "Chờ duyệt"
                : u.status === "approved"
                  ? "Đã duyệt"
                  : "Từ chối"}
            </span>
            <select
              value={u.role}
              disabled={busy || u.role === "admin"}
              onChange={(e) =>
                void updateUser(
                  u,
                  e.target.value as AppUser["role"],
                  u.status === "approved" ? "approved" : "pending",
                )
              }
            >
              <option value="viewer">Chỉ xem</option>
              <option value="editor">Người cập nhật</option>
              {u.role === "admin" && <option value="admin">Admin</option>}
            </select>
            <div className="account-actions">
              {u.status !== "approved" && (
                <button
                  className="approve"
                  disabled={busy}
                  onClick={() => void updateUser(u, u.role, "approved")}
                >
                  Duyệt
                </button>
              )}
              {u.status !== "rejected" && u.role !== "admin" && (
                <button
                  className="reject"
                  disabled={busy}
                  onClick={() => void updateUser(u, u.role, "rejected")}
                >
                  Từ chối
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const LanguageSelector = () => (
    <label className="language-selector" title="Language">
      <span>🌐</span>
      <select
        aria-label="Language"
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
      >
        <option value="vi">Tiếng Việt</option>
        <option value="en">English</option>
        <option value="ko">한국어</option>
      </select>
    </label>
  );
  if (authMode === "loading")
    return (
      <main className="auth-page">
        <div className="auth-language">
          <LanguageSelector />
        </div>
        <section className="auth-card">
          <div className="auth-logo">Q</div>
          <h1>Q-EVAL</h1>
          {error ? <><div className="form-error" role="alert">{error}</div><button className="primary" onClick={() => {setError(""); void load();}}>↻ Làm mới</button></> : <p>Đang kiểm tra quyền truy cập...</p>}
        </section>
      </main>
    );
  if (authMode === "signin")
    return (
      <main className="auth-page">
        <div className="auth-language">
          <LanguageSelector />
        </div>
        <section className="auth-card">
          <div className="auth-logo">Q</div>
          <span className="auth-kicker">HỆ THỐNG NỘI BỘ</span>
          <h1>Đăng nhập Q-EVAL</h1>
          {error && <div className="form-error">{error}</div>}
          <form className="register-form" onSubmit={login}>
            <label>
              Tên đăng nhập
              <input
                required
                autoComplete="username"
                value={credentials.username}
                onChange={(e) =>
                  setCredentials((c) => ({ ...c, username: e.target.value }))
                }
              />
            </label>
            <label>
              Mật khẩu
              <input
                type="password"
                required
                autoComplete="current-password"
                value={credentials.password}
                onChange={(e) =>
                  setCredentials((c) => ({ ...c, password: e.target.value }))
                }
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>
          <button
            className="auth-switch"
            onClick={() => {
              setError("");
              setAuthMode("register");
            }}
          >
            Đăng ký tài khoản mới
          </button>
        </section>
      </main>
    );
  if (authMode === "register")
    return (
      <main className="auth-page">
        <div className="auth-language">
          <LanguageSelector />
        </div>
        <section className="auth-card">
          <div className="auth-logo">Q</div>
          <span className="auth-kicker">ĐĂNG KÝ TÀI KHOẢN</span>
          <h1>Gửi yêu cầu cho Admin</h1>
          {error && <div className="form-error">{error}</div>}
          <form className="register-form" onSubmit={register}>
            <label>
              Tên đăng nhập
              <input
                required
                autoComplete="username"
                value={credentials.username}
                onChange={(e) =>
                  setCredentials((c) => ({ ...c, username: e.target.value }))
                }
              />
            </label>
            <label>
              Mật khẩu
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={credentials.password}
                onChange={(e) =>
                  setCredentials((c) => ({ ...c, password: e.target.value }))
                }
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Đang gửi..." : "Gửi đăng ký"}
            </button>
          </form>
          <button
            className="auth-switch"
            onClick={() => {
              setError("");
              setAuthMode("signin");
            }}
          >
            Quay lại đăng nhập
          </button>
        </section>
      </main>
    );
  if (authMode === "pending")
    return (
      <main className="auth-page">
        <div className="auth-language">
          <LanguageSelector />
        </div>
        <section className="auth-card">
          <div className="pending-icon">⌛</div>
          <span className="auth-kicker">CHỜ PHÊ DUYỆT</span>
          <h1>Đã gửi đăng ký</h1>
          <p>
            Admin sẽ kiểm tra và xác nhận tài khoản{" "}
            <b>{credentials.username}</b>.
          </p>
          <button
            className="primary auth-primary"
            onClick={() => setAuthMode("signin")}
          >
            Quay lại đăng nhập
          </button>
        </section>
      </main>
    );

  const massEnteredLots = massDraft.lots.filter((lot) => lot.partNo || lot.lotNo);
  const hasMassStageData = (stage?: MassStage) => Boolean(stage && (
    stage.equipment || stage.trackIn || stage.trackOut || stage.scrap || stage.input || stage.output || stage.fail || stage.yield
  ));
  const massStartRank = Math.max(0, massStageRank(massDraft.startStep));
  const massLastDataRank = massDraft.lots.reduce((lastRank, lot) => Math.max(lastRank,
    ...Object.entries(lot.stages).filter(([, stage]) => hasMassStageData(stage)).map(([stage]) => massStageRank(stage))), -1);
  const massVisibleStages = defaultManualStages.slice(massStartRank, 13).filter((stage) => {
    const rank = massStageRank(stage);
    return rank > massLastDataRank || massDraft.lots.some((lot) => hasMassStageData(lot.stages?.[stage]));
  });
  const massStageFields = (stage: string) => stage === defaultManualStages[0]
    ? (["input", "output", "scrap", "fail", "yield"] as const)
    : (["equipment", "input", "output", "scrap", "fail", "yield"] as const);
  const massTableColumnCount = 5 + massVisibleStages.reduce((count, stage) => count + massStageFields(stage).length, 0);
  const massPartDensityRows = [...new Map(massEnteredLots.filter((lot) => lot.partNo).map((lot) => {
    const partNo = lot.partNo.trim().toUpperCase().slice(0, 22);
    return [partNo, { partId: partNo, density: partNo.slice(5, 8) }];
  })).values()];
  const massValidLots = massDraft.lots.filter((lot) => lot.partNo && lot.lotNo);
  const massQtyTotal = massEnteredLots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
  const massStageTotals = (stage: string) => {
    const cells = massEnteredLots.map((lot) => lot.stages?.[stage]).filter((cell): cell is MassStage => Boolean(cell));
    let input = cells.reduce((sum, cell) => sum + (Number(cell.input) || 0), 0);
    let output = cells.reduce((sum, cell) => sum + (Number(cell.output) || 0), 0);
    const fail = cells.reduce((sum, cell) => sum + (Number(cell.fail) || 0), 0);
    if ([defaultManualStages[0], defaultManualStages[2]].includes(stage)) {
      const beforeRouter = massEnteredLots.reduce((sum, lot) => sum + (Number(lot.stages?.[defaultManualStages[3]]?.input) || 0), 0);
      if (beforeRouter) { output = beforeRouter; input = beforeRouter + (stage === defaultManualStages[2] ? fail : 0); }
    }
    return { input, output, fail, yield: input ? (output / input * 100).toFixed(2) : "-" };
  };
  const massStageLabel = (stage: string) => ({
    "SMT (M010/M015)": "M010/M015 (SMT)", "Soldering (M026)": "M026 (Soldering)", "iARTs (M031)": "M031 (iARTs)",
    "Router (M033)": "M033 (Router)", "M045": "M045", "Casing (M087/M120)": "M087/M120 (Casing)",
    "Aging (M100/M111)": "M100/M111 (Aging)", "LED Test (M125)": "M125 (LED Test)", "Interface (M130)": "M130 (Interface)",
    "AVI (M160)": "M160 (AVI)", "FVI (M164)": "M164 (FVI)", "Basic (M165)": "M165 (Basic)", "Packing (M170)": "M170 (Packing)",
  } as Record<string,string>)[stage] || stage;
  const massActive = massDraft.lots[activeMassLot] || emptyMassLot();
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Q</span>
          <div>
            <strong>Q-EVAL</strong>
            <small>Evaluation Management</small>
          </div>
        </div>
        <nav>
          {nav
            .filter((n) => n.id !== "users" || canAdmin)
            .map((n) => (
              <button
                key={n.id}
                className={view === n.id ? "active" : ""}
                onClick={() => setView(n.id)}
              >
                <span>{n.icon}</span>
                {n.label}
              </button>
            ))}
        </nav>
        <div className="side-footer">
          <div className="avatar">
            {me?.user?.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <strong>{me?.user?.displayName}</strong>
            <small>
              {role === "admin"
                ? "Admin"
                : role === "editor"
                  ? "Người cập nhật"
                  : "Chỉ xem"}
            </small>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p>QUẢN LÝ ĐÁNH GIÁ</p>
            <h1>DOE · PFQ · PRQ · FQ</h1>
          </div>
          <div className="top-actions">
            <LanguageSelector />
            <span className="today">{me?.identity.email}</span>
            <button
              className="icon-button signout-button"
              onClick={() => void logout()}
              title="Đăng xuất"
            >
              ↪
            </button>
            <button
              className="icon-button"
              onClick={() => void load()}
              title="Làm mới"
            >
              ↻
            </button>
          </div>
        </header>
        <div className="content">
          <section className="overview-head">
            <div>
              <h2>{headings[view][0]}</h2>
              <p>{headings[view][1]}</p>
            </div>
            {canEdit && (view === "overview" || view === "list") && (
              <div className="entry-actions">
                {view === "list" && <button className="primary mass-report-entry-button" onClick={openNewMassReport}>
                  ＋ Tạo Lot báo cáo 1K · 2K · 5K · 10K
                </button>}
                <button className="primary manual-button" onClick={openManual}>
                  ＋ Nhập thủ công
                </button>
                <button className="primary excel-button" onClick={openImport}>
                  ⇧ Nhập file Excel
                </button>
                {view === "list" && <button className="export-button list-export-button" onClick={exportCsv} disabled={!rows.length}>⇩ Xuất báo cáo</button>}
              </div>
            )}
            {view === "reports" && (
              <button className="primary" onClick={exportCsv}>
                ⇩ Xuất báo cáo
              </button>
            )}
          </section>
          {notice && (
            <div className="notice">
              {notice}
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {error && !importModal && !manualModal && !massModal && (
            <div className="alert">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {view === "overview" && (
            <QualificationDashboard />
          )}
          {view === "list" && <EvaluationTable />}
          {view === "new-product" && <NewProductEvaluation />}
          {view === "mass-report" && MassReportsView()}
          {view === "history" && <HistoryView />}
          {view === "reports" && <ReportsView />}
          {view === "users" && canAdmin && <UsersView />}
        </div>
      </section>
      {massModal && (
        <div className="modal-backdrop" onMouseDown={() => !busy && setMassModal(false)}>
          <form className="mass-report-modal" onSubmit={(event) => event.preventDefault()} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span>UPDATE BÁO CÁO ĐÁNH GIÁ</span><h2>{massDraft.id ? "Cập nhật Lot báo cáo" : "Tạo Lot mới"}</h2><p>Dán trực tiếp nhiều Part No. và Lot ID, sau đó nhấn Update tại từng Lot để nhập dữ liệu công đoạn.</p></div><button type="button" onClick={() => setMassModal(false)}>×</button></div>
            {error && <div className="form-error">{error}</div>}
            <div className="mass-modal-body">
              <section className="mass-sheet-header">
                <table className="mass-sheet-info"><tbody>
                  <tr><th>No</th><td><select required value={massDraft.evaluationNo} onChange={(event)=>{const no=event.target.value;const matches=data.filter((item)=>item.evaluationNo===no);const newest=[...matches].sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""))[0];const partNos=[...new Set(matches.map((item)=>item.partNo).filter(Boolean))];setMassDraft((current)=>({...current,evaluationNo:no,product:newest?.product||current.product,formFactor:newest?.formFactor||current.formFactor,density:[...new Set(matches.map((item)=>item.density).filter(Boolean))].join(", ")||current.density,partId:[...new Set(partNos.map((partNo)=>partNo.slice(0,22)))].join(", ")||current.partId}));}}><option value="">Chọn No.</option>{massDraft.evaluationNo&&!data.some((item)=>item.evaluationNo===massDraft.evaluationNo)&&<option value={massDraft.evaluationNo}>{massDraft.evaluationNo}</option>}{[...new Set(data.map((item)=>item.evaluationNo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi",{numeric:true})).map((no)=><option key={no}>{no}</option>)}</select></td><th>Start Step</th><td><select value={massDraft.startStep} onChange={(event)=>{const startStep=event.target.value;setMassDraft((current)=>({...current,startStep,lane:startStep===defaultManualStages[0]?current.lane:""}));}}>{defaultManualStages.map((stage)=><option key={stage}>{stage}</option>)}</select></td></tr>
                  <tr><th>Eval Type</th><td><div className="mass-sheet-eval"><select value={massEvaluationTypes.includes(massDraft.evaluationType)?massDraft.evaluationType:"__custom__"} onChange={(event)=>setMassDraft((current)=>({...current,evaluationType:event.target.value==="__custom__"?"":event.target.value}))}>{massEvaluationTypes.map((type)=><option key={type}>{type}</option>)}<option value="__custom__">Nhập tự do</option></select>{!massEvaluationTypes.includes(massDraft.evaluationType)&&<input required value={massDraft.evaluationType} onChange={(event)=>setMassDraft((current)=>({...current,evaluationType:event.target.value}))}/>}</div></td><th>Q&apos;ty</th><td><input readOnly value={massQtyTotal || ""}/></td></tr>
                  <tr><th>Phân loại</th><td><input value={massDraft.classification} onChange={(event)=>setMassDraft((current)=>({...current,classification:event.target.value}))}/></td><th>ASSY Lane</th><td><select value={massDraft.lane} onChange={(event)=>setMassDraft((current)=>({...current,lane:event.target.value}))}><option value="">Chọn Lane</option>{laneOptions.map((lane)=><option key={lane}>{lane}</option>)}</select></td></tr>
                  <tr><th>Product / Model</th><td><input readOnly value={massDraft.product}/></td><th>Status</th><td><select value={massDraft.status} onChange={(event)=>setMassDraft((current)=>({...current,status:event.target.value}))}><option>Chờ thực hiện</option><option>Đang đánh giá</option><option>Hold</option><option>ISSUE</option><option>Pending</option><option>Hoàn thành</option></select></td></tr>
                  <tr><th>Form Factor</th><td><input readOnly value={massDraft.formFactor}/></td><th>Reason</th><td><input value={massDraft.reason} placeholder="Nhập Reason" onChange={(event)=>setMassDraft((current)=>({...current,reason:event.target.value}))}/></td></tr>
                </tbody></table>
                <table className="mass-sheet-part-density"><thead><tr><th>✧ Part ID</th><th>✧ Density</th></tr></thead><tbody>{Array.from({length:4},(_item,index)=>{const row=massPartDensityRows[index];return <tr key={index}><td>{row?.partId||""}</td><td>{row?.density||""}</td></tr>;})}</tbody></table>
              </section>
              <section className="mass-lot-section mass-lot-sheet-section">
                <div className="mass-lot-list-title">✧ Danh sách các Lot đánh giá</div>
                <div className="mass-lot-table-wrap"><table className="mass-lot-table mass-lot-sheet-table"><colgroup><col className="mass-data-col"/><col className="mass-part-col"/><col className="mass-lot-col"/><col className="mass-qty-col"/>{massVisibleStages.flatMap((stage) => massStageFields(stage).map((field)=><col key={`${stage}-${field}`} className={`mass-${field === "equipment" ? "eqp" : field === "yield" ? "yld" : field}-col`}/>))}<col className="mass-status-col"/></colgroup><thead>
                  <tr><th rowSpan={2}>Data</th><th rowSpan={2}>Part No.</th><th rowSpan={2}>LOT NO.</th><th rowSpan={2}>Q&apos;ty</th>{massVisibleStages.map((stage)=><th key={stage} colSpan={massStageFields(stage).length}>{massStageLabel(stage)}</th>)}<th rowSpan={2}>Status</th></tr>
                  <tr>{massVisibleStages.flatMap((stage)=>massStageFields(stage).map((field)=>{const column=field==="equipment"?"EQP":field==="yield"?"YLD":field.toUpperCase();return <th key={`${stage}-${column}`} className={column==="SCRAP"||column==="FAIL"?"failure-head":""}>{column}</th>;}))}</tr>
                </thead><tbody>
                  {massDraft.lots.map((lot, index) => <tr key={index} className={index === activeMassLot ? "active-lot" : ""}>
                    <td><button type="button" className="lot-detail-button" onClick={() => openMassLotEditor(index)}>Update</button></td>
                    <td><input value={lot.partNo} placeholder="Dán Part No." onPaste={(event) => pasteMassDraftLots(event,index,"partNo")} onChange={(event) => updateMassDraftLot(index,{partNo:event.target.value.toUpperCase()})} /></td>
                    <td><input className="lot-no-input" value={lot.lotNo} placeholder="Dán Lot No." onPaste={(event) => pasteMassDraftLots(event,index,"lotNo")} onFocus={() => setActiveMassLot(index)} onChange={(event) => updateMassDraftLot(index,{lotNo:event.target.value.toUpperCase()})} /></td>
                    <td><input type="number" min={0} value={lot.quantity || ""} onChange={(event) => updateMassDraftLot(index,{quantity:Math.max(0,Number(event.target.value)||0)})} /></td>
                    {massVisibleStages.flatMap((stage) => { const cell=lot.stages?.[stage]; const failed=(cell?.fail||0)>=1;
                      return massStageFields(stage).map((field) => <td key={`${stage}-${field}`} className={failed && (field==="scrap"||field==="fail")?"mass-failure":""}><input aria-label={`${stage} ${field} ${lot.lotNo}`} type={["input","output","fail"].includes(field)?"number":"text"} min={0} step={field==="yield"?"0.01":undefined} value={!cell?"":field==="yield"?`${cell.yield.toFixed(2)}%`:cell[field]} onChange={(event)=>updateMassStage(index,stage,field,event.target.value.replace("%",""))} /></td>);
                    })}<td><input aria-label={`Status Lot ${lot.lotNo}`} value={lot.status || ""} placeholder="Nhập Status" onChange={(event)=>updateMassDraftLot(index,{status:event.target.value})} /></td>
                  </tr>)}
                  <tr className="mass-add-lot-row"><td colSpan={massTableColumnCount}><button type="button" onClick={()=>setMassDraft((current)=>({...current,lots:[...current.lots,emptyMassLot()]}))}>＋ Thêm Lot</button></td></tr>
                </tbody><tfoot><tr className="mass-sheet-total-row"><th colSpan={2}></th><th>Total</th><th>{massQtyTotal || 0}</th>{massVisibleStages.flatMap((stage)=>{const total=massStageTotals(stage);return massStageFields(stage).map((field)=><th key={`${stage}-total-${field}`} className={field==="scrap"||field==="fail"?"failure-head":""}>{field==="input"?total.input||0:field==="output"?total.output||0:field==="scrap"||field==="fail"?total.fail||0:field==="yield"?(total.yield==="-"?"-":`${total.yield}%`):""}</th>);})}<th/></tr></tfoot></table></div>
              </section>
            </div>
            <div className="modal-actions"><span /><button type="button" onClick={()=>setMassModal(false)}>Hủy</button><button className="primary" type="button" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await persistMassDraft(massDraft);setMassModal(false);setNotice("Đã lưu báo cáo và dữ liệu các Lot.");}catch(error){setError(error instanceof Error?error.message:"Không thể lưu báo cáo.");}finally{setBusy(false);}}}>{busy?"Đang lưu...":"Lưu báo cáo"}</button></div>
          </form>
        </div>
      )}
      {massModal && massLotEditor && (
        <div className="modal-backdrop mass-editor-backdrop" onMouseDown={() => !busy && setMassLotEditor(false)}>
          <section className="mass-lot-editor" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span>UPDATE DỮ LIỆU LOT</span><h2>{massActive.lotNo || `Lot dòng ${activeMassLot + 1}`}</h2><p>Dán dữ liệu Excel trực tiếp vào bảng. Hệ thống chỉ bổ sung công đoạn chưa có và giữ nguyên dữ liệu đã lưu.</p></div><button type="button" onClick={() => setMassLotEditor(false)}>×</button></div>
            {error && <div className="form-error">{error}</div>}
            <div className="mass-editor-content">
              <div className="mass-editor-fields"><label>Part No.<input value={massActive.partNo} onChange={(event)=>updateMassDraftLot(activeMassLot,{partNo:event.target.value.toUpperCase()})} /></label><label>Lot ID<input value={massActive.lotNo} onChange={(event)=>updateMassDraftLot(activeMassLot,{lotNo:event.target.value.toUpperCase()})} /></label></div>
              <div className="mass-editor-grid-wrap"><table className="see-update-grid"><thead><tr>{seeUpdateHeaders.map((head)=><th key={head}>{head}</th>)}</tr></thead><tbody>{massEditorRows.map((row,rowIndex)=><tr key={rowIndex}>{seeUpdateHeaders.map((_head,columnIndex)=><td key={columnIndex}><input aria-label={`${seeUpdateHeaders[columnIndex]} dòng ${rowIndex+1}`} value={row[columnIndex]||""} onPaste={(event)=>pasteMassEditorTable(event,rowIndex,columnIndex)} onChange={(event)=>updateMassEditorCell(rowIndex,columnIndex,event.target.value)} /></td>)}</tr>)}</tbody></table></div>
              <button type="button" className="see-update-add-row mass-editor-add-row" onClick={()=>setMassEditorRows((current)=>[...current,Array.from({length:seeUpdateHeaders.length},()=>"")])}>＋ Thêm dòng</button>
            </div>
            <div className="modal-actions"><span /><button type="button" onClick={()=>setMassLotEditor(false)}>Đóng</button><button className="primary" type="button" disabled={busy} onClick={saveMassEditorData}>{busy?"Đang lưu...":"Nhập dữ liệu"}</button></div>
          </section>
        </div>
      )}
      {detailLot && (
        <div className="modal-backdrop" onMouseDown={() => !detailBusy && setDetailLot(null)}>
          <section className="excel-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span>BẢNG THÔNG TIN ĐÁNH GIÁ</span>
                <h2>{detailLot.lotNo}</h2>
                <p>{detailLot.product}{detailLot.formFactor ? ` · ${detailLot.formFactor}` : ""}</p>
              </div>
              <button type="button" onClick={() => setDetailLot(null)}>×</button>
            </div>
            <div className="excel-detail-body">
              <div className="excel-detail-scroll">
                <table className="excel-summary-table">
                  <thead><tr><th>No</th><th>EVAL TYPE</th><th>Phân loại</th><th>Product</th><th>Density</th><th>Part No.</th><th>SMT Lot</th><th>Lot Current</th><th>Total Q&apos;ty</th><th>Plan Date In</th><th>Actual Date In</th><th>전산 Status</th><th>Current Step</th></tr></thead>
                  <tbody><tr><td>{detailLot.evaluationNo}</td><td>{detailLot.evaluationType}</td><td>{detailLot.evaluationContent}</td><td>{detailLot.product}</td><td>{detailLot.density}</td><td>{detailLot.partNo}</td><td>{noteValue(detailLot.note, ["SMT Lot"])}</td><td>{detailLot.lotNo}</td><td>{detailLot.quantity}</td><td>{fmtPlanDate(detailLot.targetDate)}</td><td>{detailLot.startDate ? fmtPlanDate(detailLot.startDate) : ""}</td><td>{detailLot.status}</td><td>{detailLot.currentStep || detailLot.step}</td></tr></tbody>
                </table>
              </div>
              <div className="excel-detail-scroll stage-detail-scroll">
                <table className="excel-stage-table">
                  <thead><tr><th>STT</th><th>CÔNG ĐOẠN / STEP</th><th>EQP</th><th>TRACK IN</th><th>TRACK OUT</th><th>THỜI GIAN XỬ LÝ</th><th>INPUT</th><th>OUTPUT</th><th>FAIL CODE</th><th>FAIL Q&apos;TY</th><th>YIELD</th></tr></thead>
                  <tbody>
                    {detailTimeline.map((item, index) => {
                      const trackIn = timelineTrackIn(item.note), trackOut = timelineTrackOut(item.note);
                      const failCode = noteValue(item.note, ["Fail code", "FAIL CODE"]), failQty = Number(noteValue(item.note, ["Fail Qty", "FAIL Q'TY"]));
                      const hasFailure = Boolean(failCode) && failQty >= 1;
                      return <tr key={item.id}><td>{index + 1}</td><td>{item.stage}</td><td>{noteValue(item.note, ["EQP", "Equipment", "Machine"])}</td><td>{trackIn}</td><td>{trackOut}</td><td>{noteValue(item.note, ["Processing Time"]) || showHours(hoursBetween(trackIn, trackOut))}</td><td>{noteValue(item.note, ["Input", "INPUT"])}</td><td>{noteValue(item.note, ["Output", "OUTPUT"])}</td><td className={hasFailure ? "matrix-failure" : ""}>{failCode || "-"}</td><td className={failQty >= 1 ? "matrix-failure" : ""}>{failQty >= 1 ? failQty : "-"}</td><td>{noteValue(item.note, ["Yield"])}</td></tr>;
                    })}
                    {!detailTimeline.length && <tr><td colSpan={11}>{detailBusy ? "Đang tải dữ liệu..." : "Chưa có dữ liệu công đoạn"}</td></tr>}
                  </tbody>
                </table>
              </div>
              {detailLot.evaluationType.trim().toUpperCase() === "PRQ" && (() => {
                const item = detailTimeline.find((row) => /RDT/i.test(row.stage));
                const rdt: RdtData = item ? {
                  total: noteValue(item.note, ["RDT Total"]),
                  pass: noteValue(item.note, ["RDT Pass"]),
                  fail: noteValue(item.note, ["RDT Fail", "RDT Wait"]),
                  tcQty: noteValue(item.note, ["TC Q'ty Test", "TC Qty Test"]) || "22",
                  tcTestResult: noteValue(item.note, ["TC Test Result"]),
                  tc50: noteValue(item.note, ["TC 50cyc"]),
                  tc300: noteValue(item.note, ["TC 300cyc"]),
                  tc600: noteValue(item.note, ["TC 600cyc"]),
                  humidityQty: noteValue(item.note, ["Humidity Q'ty Test", "Humidity Qty Test"]) || "45",
                  humidityResult: noteValue(item.note, ["Humidity Result"]),
                  humidity120: noteValue(item.note, ["Humidity 120hr"]),
                  humidity320: noteValue(item.note, ["Humidity 320hr"]),
                  shipQty: noteValue(item.note, ["Q'ty Ship", "Qty Ship"]) || "10",
                  mechanical: noteValue(item.note, ["Mechanical"]),
                  shippingDate: noteValue(item.note, ["Shipping Date"]),
                } : emptyRdtData();
                const readonlyField = (label: string, value: string, suffix?: string, passed?: boolean) => <label className={passed ? "rdt-passed" : ""}><span>{label}</span><div className="rdt-target-input"><input readOnly value={value} />{suffix && <small>{suffix}</small>}{passed && <b>PASS</b>}</div></label>;
                return <div className="rdt-panel detail-rdt-panel">
                  <div className="rdt-panel-head"><div className="rdt-panel-title"><strong>RDT TEST</strong><span>PRQ · Sau Aging (M111)</span></div></div>
                  <div className="rdt-groups">
                    <section className="rdt-group total"><h4>RDT Result</h4><div className="rdt-group-body">
                      {readonlyField("TOTAL Q'TY", rdt.total)}
                      {readonlyField("PASS", rdt.pass, undefined, rdtPassReached(rdt))}
                      {readonlyField("FAIL", rdt.fail)}
                    </div></section>
                    <section className="rdt-group tc"><h4>TC TEST RESULT</h4><div className="rdt-group-body">
                      {readonlyField("Q'ty Test", rdt.tcQty, "set")}
                      {readonlyField("TC 50cyc", rdt.tc50, "/50cyc", rdtTargetReached(rdt.tc50, 50))}
                      {readonlyField("TC 300cyc", rdt.tc300, "/300cyc", rdtTargetReached(rdt.tc300, 300))}
                      {readonlyField("TC 600cyc", rdt.tc600, "/600cyc", rdtTargetReached(rdt.tc600, 600))}
                    </div></section>
                    <section className="rdt-group humidity"><h4>HUMIDITY RESULT</h4><div className="rdt-group-body">
                      {readonlyField("Q'ty Test", rdt.humidityQty, "set")}
                      {readonlyField("Humidity 120hr", rdt.humidity120, "/120hr", rdtTargetReached(rdt.humidity120, 120))}
                      {readonlyField("Humidity 320hr", rdt.humidity320, "/320hr", rdtTargetReached(rdt.humidity320, 320))}
                    </div></section>
                    <section className="rdt-group mechanical"><h4>MECHANICAL</h4><div className="rdt-group-body">
                      {readonlyField("Q'ty Ship", rdt.shipQty, "set")}
                      {readonlyField("Shipping Date", rdt.shippingDate)}
                    </div></section>
                  </div>
                  <div className={`rdt-summary ${rdtIsComplete(rdt) ? "pass" : "waiting"}`}>{rdtIsComplete(rdt) ? "✓ RDT TEST PASS" : "Đang chờ hoàn thành RDT TEST"}</div>
                </div>;
              })()}
            </div>
            <div className="modal-actions"><span /><button type="button" onClick={() => setDetailLot(null)}>Đóng</button>{canEdit && <button type="button" className="primary" onClick={() => { const lot = detailLot; setDetailLot(null); void openManualUpdate(lot); }}>Update Data</button>}</div>
          </section>
        </div>
      )}
      {manualModal && (
        <div
          className="modal-backdrop"
          onMouseDown={() => !busy && setManualModal(false)}
        >
          <form
            className="manual-modal"
            onSubmit={saveManual}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>NHẬP DỮ LIỆU ĐÁNH GIÁ</span>
                <h2>{manualDraft.evaluationId ? "Update Data" : manualFromMassReport ? "Tạo Lot mới" : "Tạo Lot thủ công"}</h2>
                <p>{manualDraft.evaluationId ? "Bổ sung Track In / Track Out cho các công đoạn tiếp theo chưa cập nhật." : manualFromMassReport ? "Tạo Lot báo cáo 1K · 2K · 5K · 10K và nhập dữ liệu theo từng công đoạn." : "Nhập thông tin Lot và thời gian Track In / Track Out theo từng công đoạn."}</p>
              </div>
              <div className="manual-head-actions">
                <button type="button" className="see-lot-update-button" onClick={openSeeUpdate}>↑ Update See Lot</button>
                <label
                  className={`see-lot-compact ${seeLotFiles.length ? "loaded" : ""}`}
                  title={seeLotFiles.length ? `Đã chọn ${seeLotFiles.length} file: ${seeLotFiles.map((file) => file.name).join(", ")}` : "Chọn hoặc kéo thả nhiều file SEE Lot trong một lần"}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={dropSeeFiles}
                >
                  <input aria-label="Nhập nhiều file SEE Lot" type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => { void handleSeeFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
                  ↑ {busy ? "Đang đọc..." : seeLotFiles.length ? `Đã chọn ${seeLotFiles.length} file` : "Nhập nhiều SEE Lot"}
                </label>
                <button type="button" onClick={() => setManualModal(false)}>×</button>
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            {seeFileMessage && <div className="see-lot-message">{seeFileMessage}</div>}
            <div className="manual-body">
              <section className="manual-info-table-wrap">
                <table className="manual-info-table">
                  <tbody>
                    <tr>
                      <th>{manualDraft.evaluationType || "DOE"} No.</th>
                      <td className="auto-data-cell"><input className="auto-data-input manual-no-input" required={manualFromMassReport} inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={manualDraft.evaluationNo} onChange={(event) => setManualValue("evaluationNo", event.target.value.replace(/\D/g, ""))} /></td>
                      <th>SMT Lot</th>
                      <td><input value={manualDraft.smtLot} onChange={(event) => setManualValue("smtLot", event.target.value.toUpperCase())} /></td>
                      <th>Lot Current</th>
                      <td><input required={manualFromMassReport} value={manualDraft.lotCurrent} onChange={(event) => setManualValue("lotCurrent", event.target.value.toUpperCase())} /></td>
                    </tr>
                    <tr>
                      <th>Eval Type <b>*</b></th>
                      <td><div className="eval-type-combo"><select required value={(manualFromMassReport ? massEvaluationTypes : evaluationTypes).includes(manualDraft.evaluationType) ? manualDraft.evaluationType : "__custom__"} onChange={(event) => setManualValue("evaluationType", event.target.value === "__custom__" ? "" : event.target.value)}>{(manualFromMassReport ? massEvaluationTypes : evaluationTypes).map((type) => <option key={type} value={type}>{type}</option>)}<option value="__custom__">Nhập tự do</option></select>{!(manualFromMassReport ? massEvaluationTypes : evaluationTypes).includes(manualDraft.evaluationType) && <input required autoFocus value={manualDraft.evaluationType} onChange={(event) => setManualValue("evaluationType", event.target.value)} placeholder="Nhập Eval Type" />}</div></td>
                      <th>Part No.</th>
                      <td><input required={manualFromMassReport} value={manualDraft.partNo} onChange={(event) => setManualPartNo(event.target.value)} /></td>
                      <th>Plan Date</th>
                      <td><input value={manualDraft.planDateIn} onChange={(event) => setManualValue("planDateIn", event.target.value)} maxLength={10} inputMode="numeric" /></td>
                    </tr>
                    <tr>
                      <th>Phân loại</th>
                      <td><input value={manualDraft.classification} onChange={(event) => setManualValue("classification", event.target.value)} /></td>
                      <th>Q&apos;ty <b>*</b></th>
                      <td><input required type="number" min="1" value={manualDraft.quantity || ""} onChange={(event) => setManualValue("quantity", Number(event.target.value))} /></td>
                      <th>Current Step</th>
                      <td className="auto-data-cell"><input className="auto-data-input" readOnly value={[...manualDraft.stages].reverse().find((stage) => stage.trackIn || stage.trackOut || stage.outputQty)?.stage || ""} /></td>
                    </tr>
                    <tr>
                      <th>Product / Model <b>*</b></th>
                      <td className="auto-data-cell"><input className="auto-data-input" required value={manualDraft.product} onChange={(event) => setManualValue("product", event.target.value)} /></td>
                      <th>Density</th>
                      <td className="auto-data-cell"><input className="auto-data-input" readOnly value={manualDraft.density} /></td>
                      <th className="empty-label" /><td className="empty-value" />
                    </tr>
                    <tr>
                      <th>Form Factor</th>
                      <td className="auto-data-cell"><input className="auto-data-input" list="form-factor-options" value={manualDraft.formFactor} onChange={(event) => setManualValue("formFactor", event.target.value)} /><datalist id="form-factor-options">{formFactorOptions.map((value) => <option key={value} value={value} />)}</datalist></td>
                      <th>ASSY Lane</th>
                      <td><select value={manualDraft.lane} onChange={(event) => setManualValue("lane", event.target.value)}><option value="">Chọn Lane</option>{laneOptions.map((lane) => <option key={lane}>{lane}</option>)}</select></td>
                      <th className="empty-label" /><td className="empty-value" />
                    </tr>
                  </tbody>
                </table>
              </section>
              <section className="manual-processes">
                <div className="process-heading">
                  <div>
                    <strong>Công đoạn đánh giá</strong>
                    <span>Có thể chèn công đoạn trước hoặc sau bất kỳ Step nào.</span>
                  </div>
                  <button type="button" onClick={addManualStage}>＋ Thêm cuối</button>
                </div>
                <div className="process-table-wrap">
                  <table className="process-table">
                    <thead>
                      <tr>
                        <th>STT</th><th>CÔNG ĐOẠN / STEP</th><th>EQP</th><th>TRACK IN</th><th>TRACK OUT</th>
                        <th>THỜI GIAN XỬ LÝ</th><th>INPUT</th><th>OUTPUT</th><th>FAIL CODE</th><th>FAIL Q&apos;TY</th><th>YIELD</th><th>CHÈN / XÓA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualDraft.stages.map((stage, index) => {
                        const nextStage = manualDraft.stages[index + 1];
                        const processingHours = hoursBetween(stage.trackIn, stage.trackOut);
                        const waitingHours = nextStage ? hoursBetween(stage.trackOut, nextStage.trackIn) : null;
                        const failQty = stageFailQty(stage);
                        const yieldRate = stageYield(stage);
                        const isRdt = /RDT/i.test(stage.stage);
                        const isPrqRdt = isRdt && manualDraft.evaluationType.trim().toUpperCase() === "PRQ";
                        const isM031 = /M031|IARTS|ARTS/i.test(stage.stage);
                        const splitStageKey = stageMergeKey(stage.stage);
                        const showSplitLots = manualDraft.splitLots.length > 1 && (stageCodes(stage.stage)[0] ?? 0) >= 31 && !isRdt;
                        const rdt = stage.rdt || emptyRdtData();
                        const hasStageData = Boolean(stage.equipment || stage.trackIn || stage.trackOut || stage.inputQty || stage.outputQty || stage.failCode);
                        return (
                          <Fragment key={stage.id ?? `new-${index}`}>
                            {isPrqRdt ? (
                              <tr className="rdt-process-row">
                                <td colSpan={12}>
                                  <div className="rdt-panel">
                                    <div className="rdt-panel-head">
                                      <div className="rdt-panel-title"><strong>RDT TEST</strong><span>PRQ · Sau Aging (M111)</span></div>
                                      <div className="stage-actions">
                                        <button type="button" onClick={() => insertManualStage(index)} title="Chèn trước">＋↑</button>
                                        <button type="button" onClick={() => insertManualStage(index + 1)} title="Chèn sau">＋↓</button>
                                        <button type="button" className="remove-process" onClick={() => removeManualStage(index)} title="Xóa công đoạn">×</button>
                                      </div>
                                    </div>
                                    <div className="rdt-groups">
                                      <section className="rdt-group total"><h4>RDT Result</h4><div className="rdt-group-body">
                                        <label className="rdt-total-input"><span>TOTAL Q&apos;TY</span><input type="number" min="0" value={rdt.total} onChange={(event) => updateRdtStage(index, "total", event.target.value)} /></label>
                                        <label className={rdtPassReached(rdt) ? "rdt-passed" : ""}><span>PASS</span><div className="rdt-target-input"><input type="number" min="0" value={rdt.pass} onChange={(event) => updateRdtStage(index, "pass", event.target.value)} />{rdtPassReached(rdt) && <b>PASS</b>}</div></label>
                                        <label><span>FAIL</span><input type="number" min="0" value={rdt.fail} onChange={(event) => updateRdtStage(index, "fail", event.target.value)} /></label>
                                      </div></section>
                                      <section className="rdt-group tc"><h4>TC TEST RESULT</h4><div className="rdt-group-body">
                                        <label className="rdt-quantity-input"><span>Q&apos;ty Test</span><div className="rdt-set-input"><input type="number" min="0" value={rdt.tcQty} onChange={(event) => updateRdtStage(index, "tcQty", event.target.value)} /><small>set</small></div></label>
                                        {([['tc50', 'TC 50cyc', 50, 'cyc'], ['tc300', 'TC 300cyc', 300, 'cyc'], ['tc600', 'TC 600cyc', 600, 'cyc']] as Array<[keyof RdtData, string, number, string]>).map(([key, label, target, unit]) => {
                                          const value = rdt[key]; const passed = rdtTargetReached(value, target);
                                          return <label key={key} className={passed ? "rdt-passed" : ""}><span>{label}</span><div className="rdt-target-input"><input type="number" min="0" value={value} onChange={(event) => updateRdtStage(index, key, event.target.value)} /><small>/{target}{unit}</small>{passed && <b>PASS</b>}</div></label>;
                                        })}
                                      </div></section>
                                      <section className="rdt-group humidity"><h4>HUMIDITY RESULT</h4><div className="rdt-group-body">
                                        <label className="rdt-quantity-input"><span>Q&apos;ty Test</span><div className="rdt-set-input"><input type="number" min="0" value={rdt.humidityQty} onChange={(event) => updateRdtStage(index, "humidityQty", event.target.value)} /><small>set</small></div></label>
                                        {([['humidity120', 'Humidity 120hr', 120, 'hr'], ['humidity320', 'Humidity 320hr', 320, 'hr']] as Array<[keyof RdtData, string, number, string]>).map(([key, label, target, unit]) => {
                                          const value = rdt[key]; const passed = rdtTargetReached(value, target);
                                          return <label key={key} className={passed ? "rdt-passed" : ""}><span>{label}</span><div className="rdt-target-input"><input type="number" min="0" value={value} onChange={(event) => updateRdtStage(index, key, event.target.value)} /><small>/{target}{unit}</small>{passed && <b>PASS</b>}</div></label>;
                                        })}
                                      </div></section>
                                      <section className="rdt-group mechanical"><h4>MECHANICAL</h4><div className="rdt-group-body">
                                        <label className="rdt-quantity-input"><span>Q&apos;ty Ship</span><div className="rdt-set-input"><input type="number" min="0" value={rdt.shipQty} onChange={(event) => updateRdtStage(index, "shipQty", event.target.value)} /><small>set</small></div></label>
                                        <label><span>Shipping Date</span><input value={rdt.shippingDate} onChange={(event) => updateRdtStage(index, "shippingDate", event.target.value)} maxLength={10} inputMode="numeric" /></label>
                                      </div></section>
                                    </div>
                                    <div className={`rdt-summary ${rdtIsComplete(rdt) ? "pass" : "waiting"}`}>{rdtIsComplete(rdt) ? "✓ RDT TEST PASS" : "Đang chờ hoàn thành RDT TEST"}</div>
                                  </div>
                                </td>
                              </tr>
                            ) : <tr className={`${stage.id ? "existing-process" : ""} ${hasStageData ? "has-entered-data" : ""}`}>
                              <td>{index + 1}</td>
                              <td>
                                <select className="stage-name-field" disabled={Boolean(stage.id)} value={stage.stage} onChange={(event) => updateManualStage(index, "stage", event.target.value)}>
                                  <option value=""></option>
                                  {stage.stage && !stepOptions.includes(stage.stage) && <option value={stage.stage}>{stage.stage}</option>}
                                  {stepOptions.map((step) => <option key={step} value={step}>{step}</option>)}
                                </select>
                              </td>
                              <td>
                                {stageHasEquipment(stage.stage) ? (
                                  <div className="eqp-combo">
                                    <input className={stage.equipment ? "has-manual-data" : ""} list={`eqp-options-${index}`} value={stage.equipment} onChange={(event) => updateManualStage(index, "equipment", event.target.value)} />
                                    <datalist id={`eqp-options-${index}`}>{equipmentOptions(stage.stage).map((value) => <option key={value} value={value} />)}</datalist>
                                    <select aria-label="Chọn lại thiết bị" value="" onChange={(event) => event.target.value && updateManualStage(index, "equipment", event.target.value)}>
                                      <option value="">▼</option>
                                      {equipmentOptions(stage.stage).map((value) => <option key={value} value={value}>{value}</option>)}
                                    </select>
                                  </div>
                                ) : null}
                              </td>
                              <td><input className={stage.trackIn ? "has-manual-data" : ""} readOnly={Boolean(stage.id && stage.trackIn)} value={stage.trackIn} onChange={(event) => updateManualStage(index, "trackIn", event.target.value)} maxLength={19} inputMode="numeric" /></td>
                              <td><input className={stage.trackOut ? "has-manual-data" : ""} readOnly={Boolean(stage.id && stage.trackOut)} value={stage.trackOut} onChange={(event) => updateManualStage(index, "trackOut", event.target.value)} maxLength={19} inputMode="numeric" /></td>
                              <td><span className={`calculated-time ${processingHours !== null && processingHours < 0 ? "negative" : ""}`}>{processingHours === null ? "" : showHours(processingHours)}</span></td>
                              <td><input className={`auto-stage-quantity ${stage.inputQty ? "has-manual-data" : ""}`} readOnly value={stage.inputQty} title={stage.trackIn ? "Tự động lấy OUTPUT của công đoạn trước" : "Chỉ tự động tính khi có Track In"} /></td>
                              <td><input className={`auto-stage-quantity ${stage.outputQty ? "has-manual-data" : ""}`} readOnly value={stage.outputQty} title={stage.trackIn ? "OUTPUT = INPUT − FAIL Q'TY" : "Chỉ tự động tính khi có Track In"} /></td>
                              <td><input className={`${stage.failCode ? "has-manual-data" : ""} ${failQty !== null && failQty >= 1 && stage.failCode ? "has-failure" : ""}`} value={stage.failCode} onChange={(event) => updateManualStage(index, "failCode", event.target.value)} /></td>
                              <td><span className={`calculated-quality ${failQty !== null && failQty >= 1 ? "has-failure" : ""}`}>{failQty ?? ""}</span></td>
                              <td><span className="calculated-quality yield">{yieldRate === null ? "" : `${yieldRate.toFixed(2)}%`}</span></td>
                              <td>
                                <div className="stage-actions">
                                  <button type="button" onClick={() => insertManualStage(index)} title="Chèn trước">＋↑</button>
                                  <button type="button" onClick={() => insertManualStage(index + 1)} title="Chèn sau">＋↓</button>
                                  <button type="button" className="remove-process" onClick={() => removeManualStage(index)} title="Xóa công đoạn">×</button>
                                </div>
                              </td>
                            </tr>}
                            {showSplitLots && (
                              <tr className="lot-split-row">
                                <td colSpan={12}>
                                  <div className="lot-split-panel">
                                    <strong>Lot Split · {stage.stage}</strong>
                                    <div className="lot-split-grid lot-split-head"><span>LOT SPLIT</span><span>EQP</span><span>TRACK IN</span><span>TRACK OUT</span><span>INPUT</span><span>OUTPUT</span><span>FAIL CODE</span><span>FAIL Q&apos;TY</span><span>YIELD</span></div>
                                    {manualDraft.splitLots.map((split, splitIndex) => {
                                      const splitStage = split.stages?.[splitStageKey] || (isM031 ? split : { equipment: "", trackIn: "", trackOut: "", inputQty: "", outputQty: "", failCode: "" });
                                      const splitFail = failQtyFromScrapCode(splitStage.failCode);
                                      const splitYield = Number(splitStage.inputQty) > 0 ? Number(splitStage.outputQty) / Number(splitStage.inputQty) * 100 : null;
                                      return <div className="lot-split-grid" key={`${stage.stage}-${split.lotId}-${splitIndex}`}>
                                        <input className="lot-split-id" value={split.lotId} onChange={(event) => updateSplitLot(splitIndex, "lotId", event.target.value.toUpperCase())} />
                                        <input value={splitStage.equipment} onChange={(event) => updateSplitLotStage(splitIndex, stage.stage, "equipment", event.target.value)} />
                                        <input value={splitStage.trackIn} onChange={(event) => updateSplitLotStage(splitIndex, stage.stage, "trackIn", event.target.value)} />
                                        <input value={splitStage.trackOut} onChange={(event) => updateSplitLotStage(splitIndex, stage.stage, "trackOut", event.target.value)} />
                                        <input value={splitStage.inputQty} onChange={(event) => updateSplitLotStage(splitIndex, stage.stage, "inputQty", event.target.value.replace(/\D/g, ""))} />
                                        <input value={splitStage.outputQty} onChange={(event) => updateSplitLotStage(splitIndex, stage.stage, "outputQty", event.target.value.replace(/\D/g, ""))} />
                                        <input value={splitStage.failCode} onChange={(event) => updateSplitLotStage(splitIndex, stage.stage, "failCode", event.target.value)} />
                                        <b className={splitFail >= 1 ? "split-fail" : ""}>{splitFail}</b>
                                        <b>{splitYield === null ? "-" : `${splitYield.toFixed(2)}%`}</b>
                                      </div>;
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {nextStage && (
                              <tr className={`wait-between-row ${waitingHours !== null && waitingHours < 0 ? "negative" : ""}`}>
                                <td colSpan={12}>
                                  <div className="wait-flow-inline">
                                    <span className="wait-transition">{stage.stage || `Step ${index + 1}`} → {nextStage.stage || `Step ${index + 2}`}</span>
                                    <label className="wait-time-label">THỜI GIAN CHỜ <b>{waitingHours === null ? "" : showHours(waitingHours)}</b></label>
                                    <label className="wait-reason-label">REASON <input value={nextStage.reason} onChange={(event) => updateManualStage(index + 1, "reason", event.target.value)} /></label>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <small className="time-format-hint">Định dạng thời gian: YYYY/MM/DD HH:mm:ss · Thời gian xử lý và chờ được tính theo giờ.</small>
              </section>
              <section className="manual-review-row">
                <label>
                  Status
                  <select value={manualDraft.status} onChange={(event) => setManualValue("status", event.target.value)}>
                    <option>Chờ thực hiện</option><option>Đang đánh giá</option><option>Hold</option><option>ISSUE</option><option>Pending</option><option>Hoàn thành</option>
                  </select>
                </label>
                <label>
                  Reason
                  <input value={manualDraft.statusReason} onChange={(event) => setManualValue("statusReason", event.target.value)} placeholder="Nhập lý do Hold / ISSUE / Pending" />
                </label>
                <label>
                  Phê duyệt
                  <select value={manualDraft.approvalStatus} onChange={(event) => setManualValue("approvalStatus", event.target.value)}>
                    {approvalOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </section>
            </div>
            <div className="modal-actions">
              <span />
              <button type="button" onClick={() => setManualModal(false)} disabled={busy}>Hủy</button>
              <button className="primary" type="submit" disabled={busy}>{busy ? "Đang lưu..." : manualDraft.evaluationId ? "Cập nhật dữ liệu tiếp theo" : "Lưu Lot và Timeline"}</button>
            </div>
          </form>
        </div>
      )}
      {manualModal && seeUpdateModal && (
        <div className="modal-backdrop see-update-backdrop" onMouseDown={() => !busy && setSeeUpdateModal(false)}>
          <section className="see-update-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><span>UPDATE SEE LOT</span><h2>Nhập dữ liệu See Lot</h2><p>Dán trực tiếp dữ liệu Excel vào ô đầu tiên của bảng, sau đó nhấn Save Data.</p></div>
              <button type="button" onClick={() => setSeeUpdateModal(false)}>×</button>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="see-update-body">
              <div className="see-update-fields">
                <label><span>✧ Part No</span><input value={seeUpdatePartNo} onChange={(event) => setSeeUpdatePartNo(event.target.value.toUpperCase())} placeholder="Nhập Part No." /></label>
                <label><span>✧ Lot ID</span><input value={seeUpdateLotId} onChange={(event) => setSeeUpdateLotId(event.target.value.toUpperCase())} placeholder="Nhập Lot ID" /></label>
              </div>
              <div className="see-update-title">✧ Update data See Lot</div>
              <div className="see-update-grid-wrap">
                <table className="see-update-grid">
                  <thead><tr>{seeUpdateHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                  <tbody>{seeUpdateRows.map((row, rowIndex) => <tr key={rowIndex}>{seeUpdateHeaders.map((_header, columnIndex) =>
                    <td key={columnIndex}><input aria-label={`${seeUpdateHeaders[columnIndex]} dòng ${rowIndex + 1}`} value={row[columnIndex] || ""} onPaste={(event) => pasteSeeUpdateTable(event, rowIndex, columnIndex)} onChange={(event) => updateSeeCell(rowIndex, columnIndex, event.target.value)} /></td>
                  )}</tr>)}</tbody>
                </table>
              </div>
              <button type="button" className="see-update-add-row" onClick={() => setSeeUpdateRows(current => [...current, Array.from({ length: seeUpdateHeaders.length }, () => "")])}>＋ Thêm dòng</button>
            </div>
            <div className="modal-actions"><span /><button type="button" onClick={() => setSeeUpdateModal(false)}>Hủy</button><button type="button" className="primary" onClick={saveSeeUpdateData}>Save Data</button></div>
          </section>
        </div>
      )}
      {importModal && (
        <div
          className="modal-backdrop"
          onMouseDown={() => !busy && setImportModal(false)}
        >
          <section
            className="import-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>ĐỒNG BỘ DỮ LIỆU</span>
                <h2>Nhập file Excel đánh giá</h2>
                <p>
                  Hỗ trợ file đánh giá mẫu và file lịch sử công đoạn SEE LOT.
                </p>
              </div>
              <button type="button" onClick={() => setImportModal(false)}>
                ×
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="import-body">
              <label className={`excel-drop ${busy ? "busy" : ""}`}>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={selectExcel}
                  disabled={busy}
                />
                <span className="excel-icon">X</span>
                <strong>
                  {busy
                    ? "Đang phân tích file..."
                    : importFile
                      ? importFile.name
                      : "Chọn file Excel (.xlsx)"}
                </strong>
                <small>
                  File SEE LOT sẽ tự ghép Track In/Out, EQP, Input, Output,
                  Scrap và Yield vào Lot đã có.
                </small>
              </label>
              {importPreview && (
                <>
                  <div className="import-summary">
                    <article>
                      <span>SHEET HỢP LỆ</span>
                      <strong>{importPreview.sheets.length}</strong>
                      <small>{importPreview.sheets.join(" · ")}</small>
                    </article>
                    <article>
                      <span>LOT TÌM THẤY</span>
                      <strong>{importPreview.evaluations.length}</strong>
                      <small>Sẵn sàng đồng bộ</small>
                    </article>
                    <article>
                      <span>TIMELINE</span>
                      <strong>
                        {importPreview.evaluations.reduce(
                          (sum, item) => sum + item.timelines.length,
                          0,
                        )}
                      </strong>
                      <small>Bước công đoạn</small>
                    </article>
                    <article>
                      <span>DÒNG BỎ QUA</span>
                      <strong>{importPreview.skippedRows}</strong>
                      <small>Thiếu dữ liệu bắt buộc</small>
                    </article>
                  </div>
                  <div className="import-preview">
                    <div>
                      <strong>Xem trước dữ liệu</strong>
                      <span>{importPreview.fileName}</span>
                    </div>
                    <div className="preview-table">
                      <table>
                        <thead>
                          <tr>
                            <th>LOẠI</th>
                            <th>NỘI DUNG</th>
                            <th>LOT CURRENT</th>
                            <th>PRODUCT / PART NO.</th>
                            <th>Q&apos;TY</th>
                            <th>STATUS</th>
                            <th>RESULT</th>
                            <th>TIMELINE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.evaluations
                            .slice(0, 12)
                            .map((item) => (
                              <tr key={item.lotNo}>
                                <td>
                                  <span
                                    className={`type-badge ${colors[item.evaluationType]}`}
                                  >
                                    {item.evaluationType}
                                  </span>
                                </td>
                                <td>{item.evaluationContent || "—"}</td>
                                <td>
                                  <strong>{item.lotNo}</strong>
                                </td>
                                <td>
                                  {item.product || "Cập nhật Lot đã có"}
                                  <small>{item.partNo}</small>
                                </td>
                                <td>{item.quantity}</td>
                                <td>{item.status}</td>
                                <td>{item.result}</td>
                                <td>{`${item.timelines.length} bước`}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {importPreview.evaluations.length > 12 && (
                      <small className="preview-more">
                        {`Và ${importPreview.evaluations.length - 12} Lot khác`}
                      </small>
                    )}
                    {importPreview.warnings.length > 0 && (
                      <div className="import-warnings">
                        {importPreview.warnings.map((warning, index) => (
                          <span key={index}>! {warning}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              <span />
              <button
                type="button"
                onClick={() => setImportModal(false)}
                disabled={busy}
              >
                Hủy
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void importExcel()}
                disabled={busy || !importPreview}
              >
                {busy
                  ? "Đang đồng bộ..."
                  : `Đồng bộ ${importPreview?.evaluations.length ?? 0} Lot`}
              </button>
            </div>
          </section>
        </div>
      )}
      {editModal && (
        <div
          className="modal-backdrop"
          onMouseDown={() => !busy && setEditModal(false)}
        >
          <form
            className="modal edit-modal"
            onSubmit={saveEdit}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>CHỈNH SỬA DỮ LIỆU LOT</span>
                <h2>{draft.lotNo}</h2>
                <p>Admin và Người cập nhật đều có quyền sửa hoặc xóa.</p>
              </div>
              <button type="button" onClick={() => setEditModal(false)}>
                ×
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="form-grid">
              <label>
                No.
                <input
                  value={draft.evaluationNo}
                  onChange={(e) => setDraftValue("evaluationNo", e.target.value)}
                />
              </label>
              <label>
                Loại đánh giá
                <input
                  list="edit-evaluation-type-options"
                  value={draft.evaluationType}
                  onChange={(e) =>
                    setDraftValue("evaluationType", e.target.value)
                  }
                />
                <datalist id="edit-evaluation-type-options">{evaluationTypes.map((type) => <option key={type} value={type} />)}</datalist>
              </label>
              <label>
                Lot No.
                <input
                  required
                  value={draft.lotNo}
                  onChange={(e) =>
                    setDraftValue("lotNo", e.target.value.toUpperCase())
                  }
                />
              </label>
              <label className="wide">
                Nội dung đánh giá
                <input
                  value={draft.evaluationContent}
                  onChange={(e) =>
                    setDraftValue("evaluationContent", e.target.value)
                  }
                />
              </label>
              <label>
                Sản phẩm
                <input
                  required
                  value={draft.product}
                  onChange={(e) => setDraftValue("product", e.target.value)}
                />
              </label>
              <label>
                Form Factor
                <input list="edit-form-factor-options" value={draft.formFactor} onChange={(e) => setDraftValue("formFactor", e.target.value)} />
                <datalist id="edit-form-factor-options">{formFactorOptions.map((value) => <option key={value} value={value} />)}</datalist>
              </label>
              <label>
                Density
                <input
                  value={draft.density}
                  onChange={(e) => setDraftValue("density", e.target.value)}
                />
              </label>
              <label>
                Part No.
                <input
                  value={draft.partNo}
                  onChange={(e) => setDraftValue("partNo", e.target.value)}
                />
              </label>
              <label>
                Số lượng
                <input
                  type="number"
                  min="0"
                  value={draft.quantity}
                  onChange={(e) =>
                    setDraftValue("quantity", Number(e.target.value))
                  }
                />
              </label>
              <label>
                Lane
                <select value={draft.equipment} onChange={(e) => setDraftValue("equipment", e.target.value)}>
                  <option value="">Chọn Lane</option>
                  {laneOptions.map((lane) => <option key={lane}>{lane}</option>)}
                </select>
              </label>
              <label>
                Lot Current / Step
                <input
                  value={draft.step}
                  onChange={(e) => setDraftValue("step", e.target.value)}
                />
              </label>
              <label>
                Ngày bắt đầu
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraftValue("startDate", e.target.value)}
                />
              </label>
              <label>
                Plan Date In
                <input
                  value={draft.targetDate}
                  onChange={(e) => setDraftValue("targetDate", e.target.value)}
                  placeholder="2026/08/03"
                />
              </label>
              <label>
                Trạng thái
                <select
                  value={draft.status}
                  onChange={(e) => setDraftValue("status", e.target.value)}
                >
                  <option>Chờ thực hiện</option>
                  <option>Đang đánh giá</option>
                  <option>Hold</option>
                  <option>Hoàn thành</option>
                </select>
              </label>
              <label>
                Phê duyệt
                <select value={draft.approvalStatus} onChange={(e) => setDraftValue("approvalStatus", e.target.value)}>
                  {approvalOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Kết quả
                <select
                  value={draft.result}
                  onChange={(e) => setDraftValue("result", e.target.value)}
                >
                  <option>-</option>
                  <option>PASS</option>
                  <option>FAIL</option>
                </select>
              </label>
              <label>
                Tiến độ (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.progress}
                  onChange={(e) =>
                    setDraftValue("progress", Number(e.target.value))
                  }
                />
              </label>
              <label>
                Fail Qty
                <input
                  type="number"
                  min="0"
                  value={draft.failQty}
                  onChange={(e) =>
                    setDraftValue("failQty", Number(e.target.value))
                  }
                />
              </label>
              <label>
                Yield (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.yieldRate}
                  onChange={(e) =>
                    setDraftValue("yieldRate", Number(e.target.value))
                  }
                />
              </label>
              <label className="wide">
                Ghi chú
                <textarea
                  value={draft.note}
                  onChange={(e) => setDraftValue("note", e.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const current = data.find((item) => item.id === editing);
                  if (current) void deleteEvaluation(current);
                }}
                disabled={busy}
              >
                Xóa Lot
              </button>
              <span />
              <button
                type="button"
                onClick={() => setEditModal(false)}
                disabled={busy}
              >
                Hủy
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Đang lưu..." : "Lưu cập nhật"}
              </button>
            </div>
          </form>
        </div>
      )}
      {timelineLot && (
        <div
          className="modal-backdrop"
          onMouseDown={() => !timelineBusy && setTimelineLot(null)}
        >
          <section
            className="timeline-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>TIMELINE LOT · {timelineLot.evaluationType}</span>
                <h2>{timelineLot.lotNo}</h2>
                <p>
                  {timelineLot.product} ·{" "}
                  {timelineLot.evaluationContent || "Chưa có nội dung đánh giá"}
                </p>
              </div>
              <button type="button" onClick={() => setTimelineLot(null)}>
                ×
              </button>
            </div>
            <div className="timeline-source">
              <span>TIMELINE LOT</span>
              <strong>{`${timeline.length} bước công đoạn`}</strong>
              <small>Dữ liệu từ Excel hoặc nhập thủ công.</small>
            </div>
            <div className="timeline-layout imported">
              <div className="timeline-flow">
                <div className="flow-strip dynamic">
                  {Array.from(new Set(timeline.map((item) => item.stage))).map(
                    (stage, index) => {
                      const item = timeline.find((t) => t.stage === stage),
                        done = item?.status === "Hoàn thành",
                        active = item?.status === "Đang thực hiện",
                        hold = item?.status === "Hold";
                      return (
                        <div
                          key={stage}
                          className={`flow-step ${done ? "done" : active ? "active" : hold ? "hold" : ""}`}
                        >
                          <i>{done ? "✓" : index + 1}</i>
                          <span>{stage}</span>
                        </div>
                      );
                    },
                  )}
                </div>
                <div className="vertical-timeline">
                  {timeline.map((item, itemIndex) => {
                    const trackIn = timelineTrackIn(item.note);
                    const trackOut = timelineTrackOut(item.note);
                    const previousTrackOut = itemIndex ? timelineTrackOut(timeline[itemIndex - 1].note) : "";
                    const processingHours = hoursBetween(trackIn, trackOut);
                    const waitingHours = hoursBetween(previousTrackOut, trackIn);
                    const waitingReason = noteValue(item.note, ["Waiting Reason"]);
                    const details = (item.note || "").split(" · ").filter((part) =>
                      !["Track In:", "Track in time:", "In Date:", "Track Out:", "Out Date:", "Processing Time:", "Waiting Time:", "Waiting Reason:", "EQP:", "Equipment:", "Machine:", "Input:", "INPUT:", "Output:", "OUTPUT:", "Fail code:", "FAIL CODE:", "Fail Qty:", "FAIL Q'TY:", "Yield:"].some((label) => part.startsWith(label)),
                    );
                    return (
                      <Fragment key={item.id}>
                        {itemIndex > 0 && (
                          <div className={`timeline-wait-between ${waitingHours !== null && waitingHours < 0 ? "overlap" : ""}`}>
                            <div>
                              <small>THỜI GIAN CHỜ</small>
                              <b>{showHours(waitingHours)}</b>
                            </div>
                            <div>
                              <small>REASON</small>
                              <b>{waitingReason || "—"}</b>
                            </div>
                          </div>
                        )}
                        <article className={item.status.replaceAll(" ", "-").toLowerCase()}>
                          <div className="timeline-dot" />
                          <div className="timeline-card">
                            <div className="timeline-card-head">
                              <strong>{item.stage}</strong>
                              <span>{item.status}</span>
                            </div>
                            <time>{fmtTime(item.eventDate)}</time>
                            <div className="timeline-metrics">
                              <div><small>TRACK IN</small><b>{fmtExactTime(trackIn)}</b></div>
                              <div><small>TRACK OUT</small><b>{fmtExactTime(trackOut)}</b></div>
                              <div><small>THỜI GIAN XỬ LÝ</small><b className={processingHours !== null && processingHours < 0 ? "negative" : ""}>{showHours(processingHours)}</b></div>
                            </div>
                            <p className={item.note.includes("Fail code:") ? "has-fail-code" : ""}>
                              {(details.length ? details : ["Không có ghi chú"]).map((part, index) => (
                                <em key={`${item.id}-${index}`} className={part.startsWith("Fail code:") ? "step-fail-code" : ""}>
                                  {index ? " · " : ""}{part}
                                </em>
                              ))}
                            </p>
                          </div>
                        </article>
                      </Fragment>
                    );
                  })}
                  {!timeline.length && !timelineBusy && (
                    <div className="timeline-empty">
                      <strong>Chưa có dữ liệu Timeline</strong>
                      <span>
                        Nhập lại file Excel có thông tin công đoạn cho Lot này.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
