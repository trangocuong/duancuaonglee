import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { massEvaluationReports } from "../../../db/schema";
import { authError, requireRole } from "../../lib/authz";

const clean = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);
const allowedStatus = ["Chờ thực hiện", "Đang đánh giá", "Hold", "ISSUE", "Pending", "Hoàn thành"];

function reportValues(payload: Record<string, unknown>) {
  const evaluationNo = clean(payload.evaluationNo, 50);
  const evaluationType = clean(payload.evaluationType, 50);
  const product = clean(payload.product, 100);
  const startStep = clean(payload.startStep, 100);
  const status = clean(payload.status, 50) || "Chờ thực hiện";
  const lots = Array.isArray(payload.lots) ? payload.lots.slice(0, 500) : [];
  if (!evaluationNo) throw new Error("Vui lòng chọn No.");
  if (!evaluationType) throw new Error("Vui lòng nhập Eval Type.");
  if (!product) throw new Error("Không tìm thấy Product theo No đã chọn.");
  if (!startStep) throw new Error("Vui lòng chọn Start Step.");
  if (!lots.length) throw new Error("Vui lòng nhập ít nhất một Lot.");
  if (!allowedStatus.includes(status)) throw new Error("Trạng thái không hợp lệ.");
  const safeLots = lots.map((value) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      partNo: clean(row.partNo, 100).toUpperCase(), lotNo: clean(row.lotNo, 100).toUpperCase(), quantity: Math.max(0, Number(row.quantity) || 0),
      lane: clean(row.lane, 50),
      status: clean(row.status, 50),
      rawText: clean(row.rawText, 120000), stages: row.stages && typeof row.stages === "object" ? row.stages : {},
    };
  }).filter((row) => row.partNo && row.lotNo);
  if (!safeLots.length) throw new Error("Part No. và Lot No. không được để trống.");
  return {
    evaluationNo, evaluationType, classification: clean(payload.classification, 100), product,
    formFactor: clean(payload.formFactor, 50), startStep, partId: clean(payload.partId, 200), density: clean(payload.density, 100),
    lane: clean(payload.lane, 50), quantity: safeLots.reduce((sum, row) => sum + row.quantity, 0), status,
    reason: clean(payload.reason, 500),
    lotsJson: JSON.stringify(safeLots), updatedAt: new Date().toISOString(),
  };
}

const present = (row: typeof massEvaluationReports.$inferSelect) => ({ ...row, lots: JSON.parse(row.lotsJson || "[]") });

export async function GET(request: Request) {
  try {
    await requireRole(request, "viewer");
    const rows = await getDb(request).select().from(massEvaluationReports).orderBy(desc(massEvaluationReports.updatedAt), desc(massEvaluationReports.id));
    return Response.json({ reports: rows.map(present) });
  } catch (error) { return authError(error, "Không thể tải báo cáo 1K/2K/10K."); }
}

export async function POST(request: Request) {
  try {
    await requireRole(request, "editor");
    const payload = await request.json() as Record<string, unknown>;
    const [row] = await getDb(request).insert(massEvaluationReports).values(reportValues(payload)).returning();
    return Response.json({ report: present(row) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) return Response.json({ error: error.message }, { status: 400 });
    return authError(error, "Không thể lưu báo cáo.");
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole(request, "editor");
    const payload = await request.json() as Record<string, unknown>, id = Number(payload.id);
    if (!id) throw new Error("Thiếu mã báo cáo.");
    const [row] = await getDb(request).update(massEvaluationReports).set(reportValues(payload)).where(eq(massEvaluationReports.id, id)).returning();
    if (!row) return Response.json({ error: "Không tìm thấy báo cáo." }, { status: 404 });
    return Response.json({ report: present(row) });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) return Response.json({ error: error.message }, { status: 400 });
    return authError(error, "Không thể cập nhật báo cáo.");
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole(request, "editor");
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Thiếu mã báo cáo hợp lệ." }, { status: 400 });
    const [removed] = await getDb(request).delete(massEvaluationReports).where(eq(massEvaluationReports.id, id)).returning({ id: massEvaluationReports.id });
    if (!removed) return Response.json({ error: "Không tìm thấy báo cáo." }, { status: 404 });
    return Response.json({ id: removed.id });
  } catch (error) { return authError(error, "Không thể xóa báo cáo."); }
}
