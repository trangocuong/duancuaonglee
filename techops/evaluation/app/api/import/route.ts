import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { evaluationLogs, evaluations, evaluationTimeline } from "../../../db/schema";
import { authError, requireRole } from "../../lib/authz";

const STATUSES = ["Chờ thực hiện", "Đang đánh giá", "Hold", "Hoàn thành"];
const TIMELINE_STATUSES = ["Chờ thực hiện", "Đang thực hiện", "Hoàn thành", "Hold"];
const RESULTS = ["-", "PASS", "FAIL"];

const text = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const number = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => Math.min(max, Math.max(min, Number(value) || 0));
const date = (value: unknown) => {
  const result = text(value, 30);
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?$/.test(result) ? result : "";
};
const noteValue = (note: string, label: string) => {
  const part = (note || "").split(" · ").find((value) => value.startsWith(`${label}:`));
  return part ? part.slice(part.indexOf(":") + 1).trim() : "";
};
const stageIdentity = (stage: string) => {
  const value = stage.toUpperCase().replaceAll("_", " ");
  if (/M010|M015|SMT/.test(value)) return "smt";
  if (/M026|SOLDER/.test(value)) return "soldering";
  if (/M031|IARTS|ARTS/.test(value)) return "arts";
  if (/M033|ROUTER/.test(value)) return "router";
  if (/M045/.test(value)) return "m045";
  if (/M087|M120|CASING/.test(value)) return "casing";
  if (/M100|M111|AGING/.test(value)) return "aging";
  if (/M125|LED/.test(value)) return "ledtest";
  if (/M130|INTERFACE/.test(value)) return "interface";
  if (/M160|AVI/.test(value)) return "avi";
  if (/M164|FVI/.test(value)) return "fvi";
  if (/M165|BASIC|AQL/.test(value)) return "basic";
  if (/M170|PACK/.test(value)) return "packing";
  return value.replace(/[^A-Z0-9]+/g, "");
};
const processOrder = ["smt", "soldering", "arts", "router", "m045", "casing", "aging", "ledtest", "interface", "avi", "fvi", "basic", "packing"];
const timelineCompleted = (item: { status: string; note: string }) => item.status === "Hoàn thành" || Boolean(noteValue(item.note, "Track Out")) || Boolean(noteValue(item.note, "Output"));

function normalizeEvaluation(payload: Record<string, unknown>) {
  const rawEvaluationType = text(payload.evaluationType, 30);
  const normalizedType = rawEvaluationType.toUpperCase().replaceAll(".", "");
  const evaluationType = normalizedType === "PRODUCT EXPANSION" ? "Product Expansion"
    : normalizedType === "EXPANSION" ? "Expansion" : normalizedType;
  const lotNo = text(payload.lotNo, 100).toUpperCase();
  const product = text(payload.product, 300);
  const status = text(payload.status, 30) || "Chờ thực hiện";
  const result = text(payload.result, 10) || "-";
  if (!evaluationType) throw new Error(`Loại đánh giá không hợp lệ tại Lot ${lotNo || "không xác định"}.`);
  if (!lotNo || !product) throw new Error("Mỗi dòng Excel phải có Product và Lot Current.");
  if (!STATUSES.includes(status) || !RESULTS.includes(result)) throw new Error(`Trạng thái hoặc kết quả không hợp lệ tại Lot ${lotNo}.`);
  const timelines = Array.isArray(payload.timelines) ? payload.timelines.slice(0, 80).map(item => {
    const row = item as Record<string, unknown>;
    const stage = text(row.stage, 100), eventDate = date(row.eventDate), timelineStatus = text(row.status, 30) || "Đang thực hiện";
    if (!stage || !eventDate || !TIMELINE_STATUSES.includes(timelineStatus)) return null;
    return { stage, eventDate, status: timelineStatus, note: text(row.note, 1000) };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)) : [];
  return {
    values: {
      evaluationNo: text(payload.evaluationNo, 50), evaluationType, evaluationContent: text(payload.evaluationContent, 500), lotNo, product,
      density: text(payload.density, 100), partNo: text(payload.partNo, 300), quantity: Math.round(number(payload.quantity)), equipment: text(payload.equipment, 200),
      step: text(payload.step, 300), owner: text(payload.owner, 200), startDate: date(payload.startDate).slice(0, 10),
      targetDate: date(payload.targetDate).slice(0, 10), status, result, progress: Math.round(number(payload.progress, 0, 100)),
      failQty: Math.round(number(payload.failQty)), yieldRate: number(payload.yieldRate, 0, 100), note: text(payload.note, 2000),
      updatedAt: new Date().toISOString(),
    },
    timelines,
  };
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole(request, "editor");
    const payload = await request.json() as { fileName?: unknown; evaluations?: unknown };
    if (!Array.isArray(payload.evaluations) || !payload.evaluations.length) throw new Error("File Excel không có dữ liệu hợp lệ.");
    if (payload.evaluations.length > 1500) throw new Error("Mỗi lần chỉ được nhập tối đa 1.500 Lot.");
    const rawRows = payload.evaluations.map(item => item as Record<string, unknown>);
    const db = getDb(request);
    let created = 0, updated = 0, timelineItems = 0;
    for (const raw of rawRows) {
      const importMode = text(raw.importMode, 30);
      const rawLotNo = text(raw.lotNo, 100).toUpperCase();
      const [existing] = rawLotNo ? await db.select().from(evaluations).where(eq(evaluations.lotNo, rawLotNo)) : [];
      if (importMode === "process-history" && !existing) {
        throw new Error(`Không tìm thấy Lot ${rawLotNo || "không xác định"} trong hệ thống. Vui lòng tạo Lot thủ công trước rồi nhập lại file SEE LOT.`);
      }
      const existingTimeline = existing
        ? await db.select().from(evaluationTimeline).where(eq(evaluationTimeline.evaluationId, existing.id))
        : [];
      const mergedPayload = importMode === "process-history" && existing ? {
        ...existing,
        importMode,
        lotNo: existing.lotNo,
        step: text(raw.step, 300) || existing.step,
        startDate: text(raw.startDate, 30) || existing.startDate,
        status: text(raw.status, 30) || existing.status,
        result: Number(raw.failQty) > 0 ? "FAIL" : existing.result,
        failQty: Math.max(existing.failQty, number(raw.failQty)),
        yieldRate: number(raw.yieldRate, 0, 100) || existing.yieldRate,
        note: [existing.note, "Nguồn Excel: SEE LOT"].filter(Boolean).join(" · "),
        timelines: raw.timelines,
      } : raw;
      const row = normalizeEvaluation(mergedPayload);
      let evaluationId: number;
      if (existing) {
        const [updatedRow] = await db.update(evaluations).set(row.values).where(eq(evaluations.id, existing.id)).returning();
        evaluationId = updatedRow.id;
        updated++;
      } else {
        const [createdRow] = await db.insert(evaluations).values(row.values).returning();
        evaluationId = createdRow.id;
        created++;
      }
      let timelinesToSave = row.timelines;
      if (importMode === "process-history" && existing) {
        const importedByStage = new Map(row.timelines.map((item) => [stageIdentity(item.stage), item]));
        const retained = existingTimeline.map((item) => importedByStage.get(stageIdentity(item.stage)) ?? {
          stage: item.stage, eventDate: item.eventDate, status: item.status as typeof row.timelines[number]["status"], note: item.note,
        });
        const retainedKeys = new Set(existingTimeline.map((item) => stageIdentity(item.stage)));
        const added = row.timelines.filter((item) => !retainedKeys.has(stageIdentity(item.stage)));
        timelinesToSave = [...retained, ...added].sort((a, b) => {
          const left = processOrder.indexOf(stageIdentity(a.stage)), right = processOrder.indexOf(stageIdentity(b.stage));
          return (left < 0 ? 999 : left) - (right < 0 ? 999 : right);
        });
        const planned = noteValue(existing.note, "Manual Steps").split("|").map((stage) => stage.trim()).filter(Boolean);
        const completed = planned.filter((stage) => {
          const item = timelinesToSave.find((candidate) => stageIdentity(candidate.stage) === stageIdentity(stage));
          return item ? timelineCompleted(item) : false;
        }).length;
        const hasHold = timelinesToSave.some((item) => item.status === "Hold");
        const status = hasHold ? "Hold" : planned.length && completed === planned.length ? "Hoàn thành" : "Đang đánh giá";
        const progress = planned.length ? Math.round(completed / planned.length * 100) : row.values.progress;
        await db.update(evaluations).set({ status, progress }).where(eq(evaluations.id, evaluationId));
      }
      await db.delete(evaluationTimeline).where(eq(evaluationTimeline.evaluationId, evaluationId));
      if (timelinesToSave.length) {
        await db.insert(evaluationTimeline).values(timelinesToSave.map((item, sequence) => ({ ...item, evaluationId, sequence })));
        timelineItems += row.timelines.length;
      }
      await db.insert(evaluationLogs).values({
        evaluationId, action: "Import Excel", lotNo: row.values.lotNo, evaluationType: row.values.evaluationType,
        detail: `${existing ? "Đồng bộ" : "Tạo mới"} từ ${text(payload.fileName, 200) || "Excel"} · ${row.timelines.length} bước công đoạn · ${row.values.status} · ${row.values.result}`,
        actor: actor.user.displayName,
      });
    }
    return Response.json({ imported: rawRows.length, created, updated, timelineItems });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) return Response.json({ error: error.message }, { status: 400 });
    return authError(error, "Không thể nhập dữ liệu Excel.");
  }
}
