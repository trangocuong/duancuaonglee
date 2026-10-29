import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { evaluationLogs, evaluations, evaluationTimeline } from "../../../db/schema";
import { authError, requireRole } from "../../lib/authz";

const LANES = ["SM-SA", "SM-SB", "SM-SC", "SM-SD", "SM-SE", "SM-SF", "SM-SG"];
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const normalizeType = (value: unknown) => {
  const shown = clean(value, 30);
  return shown;
};
const parsePlanDate = (value: unknown) => {
  const shown = clean(value, 20);
  if (!shown) return null;
  const match = shown.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const milliseconds = Date.UTC(+year, +month - 1, +day);
  const check = new Date(milliseconds);
  if (check.getUTCFullYear() !== +year || check.getUTCMonth() !== +month - 1 || check.getUTCDate() !== +day) return null;
  return { display: shown, iso: `${year}-${month}-${day}` };
};
const parseManualDateTime = (value: unknown) => {
  const shown = clean(value, 30);
  if (!shown) return null;
  const match = shown.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const milliseconds = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const check = new Date(milliseconds);
  if (
    check.getUTCFullYear() !== +year || check.getUTCMonth() !== +month - 1 ||
    check.getUTCDate() !== +day || check.getUTCHours() !== +hour ||
    check.getUTCMinutes() !== +minute || check.getUTCSeconds() !== +second
  ) return null;
  return {
    display: shown,
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}`,
    milliseconds,
  };
};
const formatHours = (value: number) => `${value.toFixed(2)} h`;
const parseQuantity = (value: unknown) => {
  const text = clean(value, 30);
  if (!text) return { text: "", value: null as number | null };
  const number = Number(text);
  return { text, value: Number.isInteger(number) && number >= 0 ? number : null };
};
const failQuantityFromCode = (value: string) =>
  Array.from(value.matchAll(/\*\s*(\d+)/g)).reduce((total, match) => total + Number(match[1]), 0);
const stageIdentity = (stage: string) => {
  const value = stage.toUpperCase().replaceAll("_", " ");
  if (/M010|M015|SMT/.test(value)) return "smt";
  if (/M026|SOLDER/.test(value)) return "soldering";
  if (/M031|IARTS|ARTS/.test(value)) return "arts";
  if (/M033|ROUTER/.test(value)) return "router";
  if (/M045/.test(value)) return "m045";
  if (/M087|M120|CASING/.test(value)) return "casing";
  if (/M100|M111|AGING/.test(value)) return "aging";
  if (/RDT/.test(value)) return "rdttest";
  if (/M125|LED/.test(value)) return "ledtest";
  if (/M130|INTERFACE|\bLI\b/.test(value)) return "interface";
  if (/M160|\bAVI\b/.test(value)) return "avi";
  if (/M164|\bFVI\b/.test(value)) return "fvi";
  if (/M165|BASIC|AQL/.test(value)) return "basic";
  if (/M170|PACK/.test(value)) return "packing";
  return value.replace(/[^A-Z0-9]+/g, "");
};
const databaseErrorMessage = (error: unknown) => {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    } else break;
  }
  const combined = messages.join(" · ");
  if (/UNIQUE constraint failed.*evaluations\.lot_no|unique.*lot_no/i.test(combined)) {
    return "Lot Current đã tồn tại. Hệ thống sẽ cập nhật vào Lot hiện có; vui lòng thử lưu lại.";
  }
  if (/no such table/i.test(combined)) return "Dữ liệu đang được khởi tạo. Vui lòng thử lại.";
  return messages[0] || "Không thể lưu dữ liệu thủ công.";
};

export async function POST(request: Request) {
  try {
    const actor = await requireRole(request, "editor");
    const payload = await request.json() as Record<string, unknown>;
    const evaluationType = normalizeType(payload.evaluationType);
    const evaluationId = Number(payload.evaluationId) || 0;
    const product = clean(payload.product, 300);
    const partNo = clean(payload.partNo, 300);
    const density = partNo.slice(5, 8).toUpperCase();
    const smtLot = clean(payload.smtLot, 100).toUpperCase();
    const lotNo = clean(payload.lotCurrent, 100).toUpperCase() || smtLot;
    const quantity = Math.max(0, Math.round(Number(payload.quantity) || 0));
    const lane = clean(payload.lane, 20).toUpperCase();
    const formFactor = clean(payload.formFactor, 50);
    const approvalStatus = clean(payload.approvalStatus, 50);
    const requestedStatus = clean(payload.status, 50);
    const statusReason = clean(payload.statusReason, 500);
    if (!evaluationType) throw new Error("Eval Type không hợp lệ.");
    if (!product) throw new Error("Vui lòng nhập Product.");
    if (!lotNo) throw new Error("Vui lòng nhập SMT Lot hoặc Lot Current.");
    if (!quantity) throw new Error("Q'ty phải lớn hơn 0.");
    if (lane && !LANES.includes(lane)) throw new Error("Lane không hợp lệ.");
    const planDateText = clean(payload.planDateIn, 30);
    const planDateIn = parsePlanDate(planDateText);
    if (planDateText && !planDateIn) {
      throw new Error("Plan Date In phải đúng định dạng YYYY/MM/DD.");
    }

    const rawStages = Array.isArray(payload.stages) ? payload.stages.slice(0, 40) : [];
    const namedStages = rawStages.map((item) => {
      const row = item as Record<string, unknown>;
      const rawRdt = row.rdt && typeof row.rdt === "object" ? row.rdt as Record<string, unknown> : {};
      const trackInText = clean(row.trackIn, 30);
      const trackOutText = clean(row.trackOut, 30);
      const input = parseQuantity(row.inputQty);
      const output = parseQuantity(row.outputQty);
      return {
        id: Math.max(0, Number(row.id) || 0),
        stage: clean(row.stage, 100),
        trackInText,
        trackOutText,
        trackIn: parseManualDateTime(trackInText),
        trackOut: parseManualDateTime(trackOutText),
        equipment: clean(row.equipment, 100),
        inputText: input.text,
        input: input.value,
        outputText: output.text,
        output: output.value,
        failCode: clean(row.failCode, 300),
        reason: clean(row.reason, 300),
        rdt: {
          total: clean(rawRdt.total, 30), pass: clean(rawRdt.pass, 30), fail: clean(rawRdt.fail || rawRdt.wait, 30),
          tcQty: clean(rawRdt.tcQty, 30) || "22",
          tcTestResult: clean(rawRdt.tcTestResult, 30), tc50: clean(rawRdt.tc50, 30),
          tc300: clean(rawRdt.tc300, 30), tc600: clean(rawRdt.tc600, 30),
          humidityQty: clean(rawRdt.humidityQty, 30) || "45",
          humidityResult: clean(rawRdt.humidityResult, 30), humidity120: clean(rawRdt.humidity120, 30),
          humidity320: clean(rawRdt.humidity320, 30), shipQty: clean(rawRdt.shipQty, 30) || "10", mechanical: clean(rawRdt.mechanical, 100),
          shippingDate: clean(rawRdt.shippingDate, 30),
        },
      };
    }).filter((item) => item.stage);
    const splitLots = (Array.isArray(payload.splitLots) ? payload.splitLots : []).slice(0, 80).map((item) => {
      const row = item as Record<string, unknown>;
      const rawStages = row.stages && typeof row.stages === "object" ? row.stages as Record<string, unknown> : {};
      const stages = Object.fromEntries(Object.entries(rawStages).slice(0, 40).map(([key, value]) => {
        const stage = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return [clean(key, 80), {
          equipment: clean(stage.equipment, 100), trackIn: clean(stage.trackIn, 30), trackOut: clean(stage.trackOut, 30),
          inputQty: clean(stage.inputQty, 30), outputQty: clean(stage.outputQty, 30), failCode: clean(stage.failCode, 300),
        }];
      }).filter(([key]) => key));
      return {
        lotId: clean(row.lotId, 100).toUpperCase(), equipment: clean(row.equipment, 100),
        trackIn: clean(row.trackIn, 30), trackOut: clean(row.trackOut, 30),
        inputQty: clean(row.inputQty, 30), outputQty: clean(row.outputQty, 30), failCode: clean(row.failCode, 300),
        stages,
      };
    }).filter((item) => item.lotId);
    let previousOutput: number | null = quantity > 0 ? quantity : null;
    for (const item of namedStages) {
      if (stageIdentity(item.stage) === "rdttest") {
        item.inputText = "";
        item.input = null;
        item.outputText = "";
        item.output = null;
        continue;
      }
      if (!item.trackIn) {
        item.inputText = "";
        item.input = null;
        item.outputText = "";
        item.output = null;
        previousOutput = null;
        continue;
      }
      item.input = previousOutput;
      item.inputText = previousOutput === null ? "" : String(previousOutput);
      const failQuantity = failQuantityFromCode(item.failCode);
      item.output = previousOutput === null ? null : Math.max(0, previousOutput - failQuantity);
      item.outputText = item.output === null ? "" : String(item.output);
      previousOutput = item.output;
    }
    for (const item of namedStages) {
      if (item.trackInText && !item.trackIn) {
        throw new Error(`Track In của ${item.stage} phải đúng định dạng YYYY/MM/DD HH:mm:ss.`);
      }
      if (item.trackOutText && !item.trackOut) {
        throw new Error(`Track Out của ${item.stage} phải đúng định dạng YYYY/MM/DD HH:mm:ss.`);
      }
      if (item.trackIn && item.trackOut && item.trackOut.milliseconds < item.trackIn.milliseconds) {
        throw new Error(`Track Out của ${item.stage} không được trước Track In.`);
      }
      if (item.inputText && item.input === null) throw new Error(`INPUT của ${item.stage} phải là số nguyên không âm.`);
      if (item.outputText && item.output === null) throw new Error(`OUTPUT của ${item.stage} phải là số nguyên không âm.`);
      if (item.input !== null && item.output !== null && item.output > item.input) {
        throw new Error(`OUTPUT của ${item.stage} không được lớn hơn INPUT.`);
      }
    }
    const hasRdtData = (item: typeof namedStages[number]) => [
      item.rdt.total, item.rdt.pass, item.rdt.fail, item.rdt.tcTestResult,
      item.rdt.tc50, item.rdt.tc300, item.rdt.tc600, item.rdt.humidityResult,
      item.rdt.humidity120, item.rdt.humidity320, item.rdt.mechanical, item.rdt.shippingDate,
    ].some(Boolean) || item.rdt.tcQty !== "22" || item.rdt.humidityQty !== "45" || item.rdt.shipQty !== "10";
    const rdtComplete = (item: typeof namedStages[number]) =>
      Number(item.rdt.tc50) >= 50 && Number(item.rdt.tc300) >= 300 && Number(item.rdt.tc600) >= 600
      && Number(item.rdt.humidity120) >= 120 && Number(item.rdt.humidity320) >= 320;
    const stages = namedStages.filter((item) => item.trackIn || item.trackOut || item.equipment || item.inputText || item.outputText || item.failCode || hasRdtData(item));
    const completed = stages.filter((item) => item.trackOut || item.outputText || (stageIdentity(item.stage) === "rdttest" && rdtComplete(item))).length;
    const hasStarted = stages.length > 0;
    const allCompleted = stages.length > 0 && completed === stages.length;
    const status = allCompleted ? "Hoàn thành" : hasStarted ? "Đang đánh giá" : "Chờ thực hiện";
    const progress = stages.length ? Math.round(completed / stages.length * 100) : 0;
    const trackedDates = stages
      .flatMap((item) => [item.trackIn?.iso, item.trackOut?.iso])
      .filter((value): value is string => Boolean(value)).sort();
    const manualSteps = namedStages.map((item) => item.stage).filter(Boolean);
    const db = getDb(request);
    const [existingEvaluation] = evaluationId
      ? await db.select().from(evaluations).where(eq(evaluations.id, evaluationId))
      : await db.select().from(evaluations).where(eq(evaluations.lotNo, lotNo));
    if (evaluationId && !existingEvaluation) throw new Error("Không tìm thấy Lot cần cập nhật.");
    const existingTimeline = existingEvaluation
      ? await db.select().from(evaluationTimeline).where(eq(evaluationTimeline.evaluationId, existingEvaluation.id)).orderBy(asc(evaluationTimeline.sequence))
      : [];
    const timelineById = new Map(existingTimeline.map((item) => [item.id, item]));
    const timelineByStage = new Map(existingTimeline.map((item) => [stageIdentity(item.stage), item]));
    const existingNoteParts = (existingEvaluation?.note ?? "").split(" · ").filter((part) => part && !part.startsWith("SMT Lot:") && !part.startsWith("Manual Steps:") && !part.startsWith("Status Reason:") && !part.startsWith("Split Lots:") && part !== "Nguồn: Nhập thủ công");
    const latestQuantities = [...stages].reverse().find((item) => item.input !== null && item.output !== null);
    const evaluationValues = {
      evaluationNo: clean(payload.evaluationNo, 50),
      evaluationType,
      evaluationContent: clean(payload.classification, 300),
      lotNo,
      product,
      formFactor,
      density,
      partNo,
      quantity,
      equipment: lane || existingEvaluation?.equipment || "",
      step: [...stages].reverse().find((item) => item.trackIn || item.trackOut || item.outputText || hasRdtData(item))?.stage ?? "",
      owner: actor.user.displayName,
      startDate: trackedDates[0] ?? existingEvaluation?.startDate ?? "",
      targetDate: planDateIn?.iso ?? existingEvaluation?.targetDate ?? "",
      status: requestedStatus || status,
      approvalStatus: approvalStatus || existingEvaluation?.approvalStatus || "Chưa phê duyệt",
      result: existingEvaluation?.result ?? "-",
      progress: Math.max(existingEvaluation?.progress ?? 0, progress),
      failQty: latestQuantities
        ? Math.max(0, (latestQuantities.input ?? 0) - (latestQuantities.output ?? 0))
        : existingEvaluation?.failQty ?? 0,
      yieldRate: latestQuantities?.input
        ? (latestQuantities.output ?? 0) / latestQuantities.input * 100
        : existingEvaluation?.yieldRate ?? 0,
      note: [smtLot ? `SMT Lot: ${smtLot}` : "", manualSteps.length ? `Manual Steps: ${manualSteps.join("|")}` : "Manual Steps:", splitLots.length ? `Split Lots: ${encodeURIComponent(JSON.stringify(splitLots))}` : "", statusReason ? `Status Reason: ${statusReason}` : "", ...existingNoteParts, "Nguồn: Nhập thủ công"].filter(Boolean).join(" · "),
      updatedAt: new Date().toISOString(),
    };
    const [evaluation] = existingEvaluation
      ? await db.update(evaluations).set(evaluationValues).where(eq(evaluations.id, existingEvaluation.id)).returning()
      : await db.insert(evaluations).values(evaluationValues).returning();

    let changedTimelineItems = 0;
    const retainedStageKeys = new Set(namedStages.map((item) => stageIdentity(item.stage)));
    for (const savedItem of existingTimeline) {
      if (!retainedStageKeys.has(stageIdentity(savedItem.stage))) {
        await db.delete(evaluationTimeline).where(eq(evaluationTimeline.id, savedItem.id));
      }
    }
    if (stages.length) {
      let previousTrackOut: ReturnType<typeof parseManualDateTime> = null;
      for (const [sequence, item] of namedStages.entries()) {
        if (!stages.includes(item)) continue;
        const processingHours = item.trackIn && item.trackOut
          ? (item.trackOut.milliseconds - item.trackIn.milliseconds) / 3600000
          : null;
        const waitingHours = previousTrackOut && item.trackIn
          ? (item.trackIn.milliseconds - previousTrackOut.milliseconds) / 3600000
          : null;
        const savedItem = item.id
          ? timelineById.get(item.id)
          : timelineByStage.get(stageIdentity(item.stage));
        const preservedParts = (savedItem?.note ?? "").split(" · ").filter((part) =>
          part && !["Nguồn:", "Track In:", "Track in time:", "In Date:", "Track Out:", "Out Date:", "Processing Time:", "Waiting Time:", "Waiting Reason:", "EQP:", "Equipment:", "Machine:", "Input:", "INPUT:", "Output:", "OUTPUT:", "Fail code:", "FAIL CODE:", "Fail Qty:", "FAIL Q'TY:", "Yield:", "RDT Total:", "RDT Pass:", "RDT Fail:", "RDT Wait:", "TC Q'ty Test:", "TC Qty Test:", "TC Test Result:", "TC 50cyc:", "TC 300cyc:", "TC 600cyc:", "Humidity Q'ty Test:", "Humidity Qty Test:", "Humidity Result:", "Humidity 120hr:", "Humidity 320hr:", "Q'ty Ship:", "Qty Ship:", "Mechanical:", "Shipping Date:"].some((label) => part.startsWith(label)),
        );
        const failQty = item.input !== null && item.output !== null ? item.input - item.output : null;
        const yieldRate = item.input ? (item.output ?? 0) / item.input * 100 : null;
        const row = {
          evaluationId: evaluation.id,
          sequence,
          stage: item.stage,
          eventDate: item.trackOut?.iso || item.trackIn?.iso || savedItem?.eventDate || new Date().toISOString(),
          status: item.trackOut || item.outputText || (stageIdentity(item.stage) === "rdttest" && rdtComplete(item)) ? "Hoàn thành" : "Đang thực hiện",
          note: [
            "Nguồn: Nhập thủ công",
            ...preservedParts,
            item.trackIn ? `Track In: ${item.trackIn.display}` : "",
            item.trackOut ? `Track Out: ${item.trackOut.display}` : "",
            processingHours !== null ? `Processing Time: ${formatHours(processingHours)}` : "",
            item.equipment ? `EQP: ${item.equipment}` : "",
            item.inputText ? `Input: ${item.input}` : "",
            item.outputText ? `Output: ${item.output}` : "",
            item.failCode ? `Fail code: ${item.failCode}` : "",
            failQty !== null ? `Fail Qty: ${failQty}` : "",
            yieldRate !== null ? `Yield: ${yieldRate.toFixed(2)}%` : "",
            waitingHours !== null ? `Waiting Time: ${formatHours(waitingHours)}` : "",
            item.reason ? `Waiting Reason: ${item.reason}` : "",
            item.rdt.total ? `RDT Total: ${item.rdt.total}` : "",
            item.rdt.pass ? `RDT Pass: ${item.rdt.pass}` : "",
            item.rdt.fail ? `RDT Fail: ${item.rdt.fail}` : "",
            item.rdt.tcQty ? `TC Q'ty Test: ${item.rdt.tcQty}` : "",
            item.rdt.tcTestResult ? `TC Test Result: ${item.rdt.tcTestResult}` : "",
            item.rdt.tc50 ? `TC 50cyc: ${item.rdt.tc50}` : "",
            item.rdt.tc300 ? `TC 300cyc: ${item.rdt.tc300}` : "",
            item.rdt.tc600 ? `TC 600cyc: ${item.rdt.tc600}` : "",
            item.rdt.humidityQty ? `Humidity Q'ty Test: ${item.rdt.humidityQty}` : "",
            item.rdt.humidityResult ? `Humidity Result: ${item.rdt.humidityResult}` : "",
            item.rdt.humidity120 ? `Humidity 120hr: ${item.rdt.humidity120}` : "",
            item.rdt.humidity320 ? `Humidity 320hr: ${item.rdt.humidity320}` : "",
            item.rdt.shipQty ? `Q'ty Ship: ${item.rdt.shipQty}` : "",
            item.rdt.mechanical ? `Mechanical: ${item.rdt.mechanical}` : "",
            item.rdt.shippingDate ? `Shipping Date: ${item.rdt.shippingDate}` : "",
          ].filter(Boolean).join(" · "),
        };
        if (item.trackOut) previousTrackOut = item.trackOut;
        if (savedItem) {
          await db.update(evaluationTimeline).set(row).where(eq(evaluationTimeline.id, savedItem.id));
        } else {
          await db.insert(evaluationTimeline).values(row);
        }
        changedTimelineItems++;
      }
    }
    await db.insert(evaluationLogs).values({
      evaluationId: evaluation.id,
      action: existingEvaluation ? "Update Data" : "Nhập thủ công",
      lotNo,
      evaluationType,
      detail: `${existingEvaluation ? "Bổ sung dữ liệu thủ công" : "Tạo Lot thủ công"} · ${changedTimelineItems} công đoạn cập nhật · ${completed} công đoạn Track Out${splitLots.length ? ` · ${splitLots.length} Lot Split` : ""}`,
      actor: actor.user.displayName,
    });
    return Response.json({ evaluation, timelineItems: changedTimelineItems, updated: Boolean(existingEvaluation) }, { status: existingEvaluation ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && !("status" in error)) {
      return Response.json({ error: databaseErrorMessage(error) }, { status: 400 });
    }
    return authError(error, "Không thể lưu dữ liệu thủ công.");
  }
}
