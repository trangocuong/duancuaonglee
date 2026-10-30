import {
  escapeHtml, html, json, redirect, isValidIsoDate,
} from "../utils/helpers.js";
import {
  STATUS_OPTIONS, PRIORITY_OPTIONS, getLang, t,
} from "../i18n/index.js";
import {
  buildDisplayTranslationMap, warmTranslationCache, translatedText,
} from "../modules/translation/translation-service.js";
import {
  renderTasksDashboardView,
  renderTaskNotFoundView,
  renderTaskDetailView,
} from "../views/tasks.js";

export async function pageDashboard(request, env, user) {
  const lang = getLang(request, user);
  const tasks = await env.DB.prepare(
    `SELECT id, title, status, priority, owner, due_date, completed_at, created_at
       FROM tech_task ORDER BY
         CASE status WHEN '조치중' THEN 0 WHEN '검토중' THEN 1 WHEN '보류' THEN 2 ELSE 3 END,
         CASE priority WHEN '상' THEN 0 WHEN '중' THEN 1 ELSE 2 END,
         id DESC`
  ).all();
  const taskTranslations = await buildDisplayTranslationMap(env, tasks.results.map((task) => task.title), lang);

  return html(renderTasksDashboardView({
    tasks: tasks.results,
    taskTranslations,
    user,
    lang,
  }));
}

export async function handleTaskCreate(request, env, user) {
  const form = await request.formData();
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const rawPriority = String(form.get("priority") || "중");
  const priority = PRIORITY_OPTIONS.includes(rawPriority) ? rawPriority : "중";
  const owner = String(form.get("owner") || "").trim();
  const rawDueDate = String(form.get("due_date") || "").trim();
  const dueDate = rawDueDate && isValidIsoDate(rawDueDate) ? rawDueDate : null;
  if (!title) return redirect("/tasks");

  await warmTranslationCache(env, [title, description]);
  await env.DB.prepare(
    `INSERT INTO tech_task (title, description, priority, owner, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(title, description || null, priority, owner || null, dueDate, user.id).run();

  return redirect("/tasks");
}

export async function pageTaskDetail(request, env, user, id) {
  const lang = getLang(request, user);
  const task = await env.DB.prepare(`SELECT * FROM tech_task WHERE id = ?`).bind(id).first();
  if (!task) return html(renderTaskNotFoundView({ user, lang }), 404);

  const updates = await env.DB.prepare(
    `SELECT tu.id, tu.content, tu.created_at, u.display_name
       FROM tech_update tu LEFT JOIN techops_users u ON u.id = tu.author_id
      WHERE tu.task_id = ? ORDER BY tu.id DESC`
  ).bind(id).all();
  const taskTranslations = await buildDisplayTranslationMap(env, [
    task.title,
    task.description,
    ...updates.results.map((update) => update.content),
  ], lang);
  const taskTitle = translatedText(task.title, taskTranslations);
  const taskDescription = translatedText(task.description, taskTranslations);

  return html(renderTaskDetailView({
    task,
    taskTitle,
    taskDescription,
    updates: updates.results,
    taskTranslations,
    user,
    lang,
  }));
}

export async function handleTaskUpdateStatus(request, env, user, id) {
  const task = await env.DB.prepare(`SELECT * FROM tech_task WHERE id = ?`).bind(id).first();
  if (!task) return redirect("/tasks");

  const form = await request.formData();
  const rawStatus = String(form.get("status") || task.status);
  const rawPriority = String(form.get("priority") || task.priority);
  const status = STATUS_OPTIONS.includes(rawStatus) ? rawStatus : task.status;
  const priority = PRIORITY_OPTIONS.includes(rawPriority) ? rawPriority : task.priority;
  const owner = String(form.get("owner") || "").trim() || null;
  const rawDueDate = String(form.get("due_date") || "").trim();
  const dueDate = !rawDueDate ? null : isValidIsoDate(rawDueDate) ? rawDueDate : task.due_date;
  const completedAt = status === "완료"
    ? (task.completed_at || new Date().toISOString().replace("Z", ""))
    : null;

  await env.DB.prepare(
    `UPDATE tech_task SET status=?, priority=?, owner=?, due_date=?, completed_at=?, updated_at=datetime('now') WHERE id=?`
  ).bind(status, priority, owner, dueDate, completedAt, id).run();

  return redirect(`/tasks/${id}`);
}

export async function handleTaskAddUpdate(request, env, user, id) {
  const form = await request.formData();
  const content = String(form.get("content") || "").trim();
  if (content) {
    await warmTranslationCache(env, [content]);
    await env.DB.prepare(
      `INSERT INTO tech_update (task_id, content, author_id) VALUES (?, ?, ?)`
    ).bind(id, content, user.id).run();
  }
  return redirect(`/tasks/${id}`);
}

export async function apiListTasks(request, env) {
  const tasks = await env.DB.prepare(`SELECT * FROM tech_task ORDER BY id DESC`).all();
  return json({ tasks: tasks.results });
}

export async function apiListReports(request, env) {
  const reports = await env.DB.prepare(`SELECT * FROM tech_report_log ORDER BY id DESC LIMIT 100`).all();
  return json({ reports: reports.results });
}

export async function apiCreateReport(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const { report_type = "weekly", period_start = null, period_end = null, content = "" } = body;
  const res = await env.DB.prepare(
    `INSERT INTO tech_report_log (report_type, period_start, period_end, content, generated_by) VALUES (?, ?, ?, ?, ?)`
  ).bind(report_type, period_start, period_end, content, user.id).run();
  return json({ id: res.meta.last_row_id }, 201);
}

