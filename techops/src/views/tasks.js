/**
 * Tasks Views — HTML templates for Task dashboard, list, and detail
 */

import { escapeHtml } from "../utils/helpers.js";
import { layout } from "./layout.js";
import { STATUS_OPTIONS, PRIORITY_OPTIONS, t } from "../i18n/index.js";
import { translatedText } from "../modules/translation/translation-service.js";

export function renderTasksDashboardView({ tasks, taskTranslations, user, lang }) {
  const L = t(lang);
  const rows = tasks.map((t2) => `
    <tr>
      <td>#${t2.id}</td>
      <td><a href="/tasks/${t2.id}">${escapeHtml(translatedText(t2.title, taskTranslations))}</a></td>
      <td><span class="badge b-${escapeHtml(t2.status)}">${escapeHtml(L.statusLabels[t2.status] || t2.status)}</span></td>
      <td>${escapeHtml(L.priorityLabels[t2.priority] || t2.priority)}</td>
      <td>${escapeHtml(t2.owner || "-")}</td>
      <td>${escapeHtml(t2.due_date || "-")}</td>
    </tr>`).join("");

  return layout({
    title: L.dashboardTitle,
    user,
    lang,
    activeNav: "tasks",
    activeSubNav: "legacy",
    body: `
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
      <h2 style="margin-top:0;">${escapeHtml(L.taskListHeading)} (${tasks.length})</h2>
      <table>
        <thead><tr><th>${escapeHtml(L.colId)}</th><th>${escapeHtml(L.colTitle)}</th><th>${escapeHtml(L.colStatus)}</th><th>${escapeHtml(L.colPriority)}</th><th>${escapeHtml(L.colAssignee)}</th><th>${escapeHtml(L.colDueDate)}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">${escapeHtml(L.noTasks)}</td></tr>`}</tbody>
      </table>
    </div>`,
  });
}

export function renderTaskNotFoundView({ user, lang }) {
  const L = t(lang);
  return layout({
    title: L.notFoundTitle,
    user,
    lang,
    body: `<div class="card">${escapeHtml(L.taskNotFound)}</div>`,
  });
}

export function renderTaskDetailView({ task, taskTitle, taskDescription, updates, taskTranslations, user, lang }) {
  const L = t(lang);
  const updateRows = updates.map((u) => `
    <div style="border-top:1px solid var(--border); padding:10px 0;">
      <div class="muted">${escapeHtml(u.display_name || L.unknown)} · ${escapeHtml(u.created_at)}</div>
      <div>${escapeHtml(translatedText(u.content, taskTranslations)).replace(/\n/g, "<br>")}</div>
    </div>`).join("");

  return layout({
    title: `#${task.id} ${taskTitle}`,
    user,
    lang,
    activeNav: "tasks",
    body: `
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
    </div>`,
  });
}

