import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const evaluations = sqliteTable("qeval_evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  evaluationNo: text("evaluation_no").notNull().default(""),
  evaluationType: text("evaluation_type").notNull(),
  evaluationContent: text("evaluation_content").notNull().default(""),
  lotNo: text("lot_no").notNull().unique(),
  product: text("product").notNull(),
  formFactor: text("form_factor").notNull().default(""),
  density: text("density").notNull().default(""),
  partNo: text("part_no").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  equipment: text("equipment").notNull().default(""),
  step: text("step").notNull().default(""),
  owner: text("owner").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  targetDate: text("target_date").notNull().default(""),
  status: text("status").notNull().default("Chờ thực hiện"),
  approvalStatus: text("approval_status").notNull().default("Chưa phê duyệt"),
  result: text("result").notNull().default("-"),
  progress: integer("progress").notNull().default(0),
  failQty: integer("fail_qty").notNull().default(0),
  yieldRate: real("yield_rate").notNull().default(0),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const evaluationLogs = sqliteTable("qeval_evaluation_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  evaluationId: integer("evaluation_id"),
  action: text("action").notNull(),
  lotNo: text("lot_no").notNull(),
  evaluationType: text("evaluation_type").notNull(),
  detail: text("detail").notNull().default(""),
  actor: text("actor").notNull().default("Người dùng web"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const evaluationTimeline = sqliteTable("qeval_evaluation_timeline", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  evaluationId: integer("evaluation_id").notNull(),
  sequence: integer("sequence").notNull().default(0),
  stage: text("stage").notNull(),
  eventDate: text("event_date").notNull(),
  status: text("status").notNull().default("Chờ thực hiện"),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const massEvaluationReports = sqliteTable("qeval_mass_evaluation_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  evaluationNo: text("evaluation_no").notNull().default(""),
  evaluationType: text("evaluation_type").notNull(),
  classification: text("classification").notNull().default(""),
  product: text("product").notNull().default(""),
  formFactor: text("form_factor").notNull().default(""),
  startStep: text("start_step").notNull().default(""),
  partId: text("part_id").notNull().default(""),
  density: text("density").notNull().default(""),
  lane: text("lane").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  status: text("status").notNull().default("Chờ thực hiện"),
  reason: text("reason").notNull().default(""),
  lotsJson: text("lots_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
