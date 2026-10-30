import {
  escapeHtml, html, json, redirect, isValidIsoDate,
} from "../utils/helpers.js";
import { layout } from "../views/layout.js";
import {
  STATUS_OPTIONS, PRIORITY_OPTIONS, getLang, t,
} from "../../i18n.js";
import {
  buildDisplayTranslationMap, warmTranslationCache, translatedText,
} from "../modules/translation/translation-service.js";

export async function pageDashboard(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  const section = new URL(request.url).searchParams.get("section") === "list" ? "list" : "overview";
  const tasks = await env.DB.prepare(
    `SELECT id, title, status, priority, owner, due_date, completed_at, created_at
       FROM tech_task ORDER BY
         CASE status WHEN '조치중' THEN 0 WHEN '검토중' THEN 1 WHEN '보류' THEN 2 ELSE 3 END,
         CASE priority WHEN '상' THEN 0 WHEN '중' THEN 1 ELSE 2 END,
         id DESC`
  ).all();
  const taskTranslations = await buildDisplayTranslationMap(env, tasks.results.map((task) => task.title), lang);

  const rows = tasks.results.map((t2) => `
    <tr>
      <td>#${t2.id}</td>
      <td><a href="/tasks/${t2.id}">${escapeHtml(translatedText(t2.title, taskTranslations))}</a></td>
      <td><span class="badge b-${escapeHtml(t2.status)}">${escapeHtml(L.statusLabels[t2.status] || t2.status)}</span></td>
      <td>${escapeHtml(L.priorityLabels[t2.priority] || t2.priority)}</td>
      <td>${escapeHtml(t2.owner || "-")}</td>
      <td>${escapeHtml(t2.due_date || "-")}</td>
    </tr>`).join("");

  return html(layout({
    title: L.dashboardTitle, user, lang, activeNav: "tasks", activeSubNav: "legacy", body: `
    <div class="card" id="new-task">
      <h2 style="margin-top:0;">${escapeHtml(L.newTaskHeading)}</h2>
      <form method="post" action="/tasks/new">
        <div class="row">
          <div><label>${escapeHtml(L.fieldTitle)}</label><input name="title" required></div>
          <div><label>${escapeHtml(L.fieldAssignee)}</label><input name="owner"></div>
        </div>
        <label>${escapeHtml(L.fieldDescription)}</label>
        <textarea name="description"></textarea>
        <div class="row">
          <div><label>${escapeHtml(L.fieldPriority)}</label>
            <select name="priority">${PRIORITY_OPTIONS.map(p => `<option value="${p}" ${p === "중" ? "selected" : ""}>${escapeHtml(L.priorityLabels[p])}</option>`).join("")}</select>
          </div>
          <div><label>${escapeHtml(L.fieldDueDate)}</label><input name="due_date" type="date"></div>
        </div>
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </div>
    <div class="card" id="task-list">
      <h2 style="margin-top:0;">${escapeHtml(L.taskListHeading)} (${tasks.results.length})</h2>
      <table>
        <thead><tr><th>${escapeHtml(L.colId)}</th><th>${escapeHtml(L.colTitle)}</th><th>${escapeHtml(L.colStatus)}</th><th>${escapeHtml(L.colPriority)}</th><th>${escapeHtml(L.colAssignee)}</th><th>${escapeHtml(L.colDueDate)}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">${escapeHtml(L.noTasks)}</td></tr>`}</tbody>
      </table>
    </div>` }));
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
  const lang = getLang(request);
  const L = t(lang);
  const task = await env.DB.prepare(`SELECT * FROM tech_task WHERE id = ?`).bind(id).first();
  if (!task) return html(layout({ title: L.notFoundTitle, user, lang, body: `<div class="card">${escapeHtml(L.taskNotFound)}</div>` }), 404);

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

  const updateRows = updates.results.map((u) => `
    <div style="border-top:1px solid var(--border); padding:10px 0;">
      <div class="muted">${escapeHtml(u.display_name || L.unknown)} · ${escapeHtml(u.created_at)}</div>
      <div>${escapeHtml(translatedText(u.content, taskTranslations)).replace(/\n/g, "<br>")}</div>
    </div>`).join("");

  return html(layout({
    title: `#${task.id} ${taskTitle}`, user, lang, activeNav: "tasks", body: `
    <p><a href="/tasks">${escapeHtml(L.backToList)}</a></p>
    <div class="card">
      <h2 style="margin-top:0;">#${task.id} ${escapeHtml(taskTitle)}</h2>
      <p>${escapeHtml(taskDescription).replace(/\n/g, "<br>") || `<span class="muted">${escapeHtml(L.noDescription)}</span>`}</p>
      <form method="post" action="/tasks/${task.id}/update">
        <div class="row">
          <div><label>${escapeHtml(L.colStatus)}</label>
            <select name="status">
              ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === task.status ? "selected" : ""}>${escapeHtml(L.statusLabels[s])}</option>`).join("")}
            </select>
          </div>
          <div><label>${escapeHtml(L.fieldPriority)}</label>
            <select name="priority">
              ${PRIORITY_OPTIONS.map(p => `<option value="${p}" ${p === task.priority ? "selected" : ""}>${escapeHtml(L.priorityLabels[p])}</option>`).join("")}
            </select>
          </div>
          <div><label>${escapeHtml(L.fieldAssignee)}</label><input name="owner" value="${escapeHtml(task.owner || "")}"></div>
          <div><label>${escapeHtml(L.fieldDueDate)}</label><input name="due_date" type="date" value="${escapeHtml(task.due_date || "")}"></div>
        </div>
        <div style="margin-top:12px;"><button type="submit">${escapeHtml(L.save)}</button></div>
      </form>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">${escapeHtml(L.progressHeading)}</h3>
      <form method="post" action="/tasks/${task.id}/updates">
        <textarea name="content" placeholder="${escapeHtml(L.progressPlaceholder)}" required></textarea>
        <div style="margin-top:8px;"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
      ${updateRows || `<p class="muted">${escapeHtml(L.noProgress)}</p>`}
    </div>` }));
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

