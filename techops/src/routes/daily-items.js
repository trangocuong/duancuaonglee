import {
  escapeHtml, html, json, plainText, redirect, isValidIsoDate, businessDateString,
} from "../utils/helpers.js";
import {
  layout, dailyWorkSubtabs, forbiddenResponse,
} from "../views/layout.js";
import {
  DEFAULT_LANG, getLang, t, WORK_CATEGORIES,
  STANDARD_OPTION_LABELS, DAILY_STATUS_LABELS,
} from "../i18n/index.js";
import {
  normalizeDailyStatusCode, resolveStandardOptionValue, translateText,
  warmTranslationCache, buildDisplayTranslationMap, resolveTrilingualText, translatedText,
} from "../modules/translation/translation-service.js";
import { normalizeLotIds, lotInput, lotScript } from "../modules/lot/lot-info.js";
import {
  DAILY_CLASSIFICATION_FIELDS, isValidClassification,
} from "../config/daily-config.js";
import {
  loadDailyFields, activeDailyFields, hasDailyClassification,
  resolveFieldLabel, resolveOptionValue, isIdentifierField, resolveValueText,
} from "./daily-fields.js";
import {
  attachFieldValues, renderFieldInput, CASCADING_SELECT_SCRIPT,
  dailyClassificationScript, describePartNumberMatches, getUpdateFieldMap,
  firstDailyValue, isIssueStatus, isDoneStatus,
} from "../modules/daily/daily-helpers.js";
import { STALE_THRESHOLD_DAYS } from "./daily-reports.js";

export async function pageDailyItems(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  const U = L.dailyUi;
  const url = new URL(request.url);

  const requestedPart = url.searchParams.get("part") || "all";
  const selectedPart = ["SSD", "Module"].includes(requestedPart) ? requestedPart : "all";
  const activeOnly = url.searchParams.get("active") !== "0";

  // "최근 상태"는 기본 시드 필드인 라벨 '상태'의 최신 값을 찾아 보여주는 참고용 요약이다.
  // 관리자가 그 필드 라벨을 바꾸거나 지우면 이 열은 그냥 "-"로 빠진다(별도 처리 불필요).
  // lang은 getLang()이 반환하는 고정된 3개 값(ko/en/vi) 중 하나뿐이라 SQL에 직접 넣어도 안전함 —
  // 값 자체가 아니라 "어느 번역 컬럼을 볼지"라서 바인딩 파라미터로는 표현할 수 없음.
  const statusValueCol = lang === "en" ? "COALESCE(v.value_en, v.value)" : lang === "vi" ? "COALESCE(v.value_vi, v.value)" : "v.value";
  let sql = `SELECT i.*,
      (SELECT ${statusValueCol} FROM tech_daily_update u JOIN tech_daily_update_value v ON v.update_id = u.id
         JOIN tech_daily_field f ON f.id = v.field_id AND f.label = '상태'
        WHERE u.item_id = i.id ORDER BY u.report_date DESC, u.id DESC LIMIT 1) AS latest_status,
      (SELECT u.report_date FROM tech_daily_update u WHERE u.item_id = i.id ORDER BY u.report_date DESC, u.id DESC LIMIT 1) AS latest_date
    FROM tech_daily_item i WHERE 1=1`;
  const params = [];
  if (selectedPart !== "all") { sql += ` AND i.part = ?`; params.push(selectedPart); }
  if (activeOnly) { sql += ` AND i.closed_at IS NULL`; }
  sql += ` ORDER BY i.part, i.category, i.id DESC`;

  const items = await env.DB.prepare(sql).bind(...params).all();
  const itemTranslations = await buildDisplayTranslationMap(
    env,
    items.results.flatMap((item) => [item.title, item.latest_status]),
    lang
  );

  // 대분류는 표준 4종으로 통제하고 화면에서만 번역한다. 담당자는 로그인 계정의
  // 표시 이름으로 고정하며 서버도 제출값을 신뢰하지 않는다.
  const categorySelectOptions = WORK_CATEGORIES.map((value) =>
    `<option value="${escapeHtml(value)}">${escapeHtml(resolveStandardOptionValue(value, lang))}</option>`
  ).join("");
  const { fields, optionValueById } = await loadDailyFields(env);
  const combinedEntry = hasDailyClassification(fields);
  const fieldTranslations = combinedEntry ? await buildDisplayTranslationMap(env, [
    ...fields.filter((field) => !((lang === "en" && field.label_en) || (lang === "vi" && field.label_vi))).map((field) => field.label),
    ...fields.flatMap((field) => field.options.map((option) => option.value)),
  ], lang) : new Map();
  const reportInputs = combinedEntry ? fields.map((field) => `
    <div><label>${escapeHtml(resolveFieldLabel(field, lang, fieldTranslations))}</label>
    ${renderFieldInput(field, L, "", optionValueById, lang, fieldTranslations)}</div>`).join("\n") : "";

  const rows = items.results.map((it) => {
    const status = resolveOptionValue(it.latest_status || "-", lang, itemTranslations, true);
    const statusClass = isIssueStatus(it.latest_status) ? " issue" : isDoneStatus(it.latest_status) ? " done" : "";
    return `
    <tr>
      <td data-label="${escapeHtml(L.colPart)}">${escapeHtml(it.part)}</td>
      <td data-label="${escapeHtml(L.colCategory)}">${escapeHtml(resolveOptionValue(it.category || "-", lang, itemTranslations))}</td>
      <td data-label="${escapeHtml(L.colTitle)}"><a href="/daily-items/${it.id}">${escapeHtml(translatedText(it.title, itemTranslations))}</a></td>
      <td data-label="${escapeHtml(L.colAssignee)}">${escapeHtml(it.owner || "-")}</td>
      <td data-label="${escapeHtml(L.colLatestStatus)}">${it.latest_status ? `<span class="status-pill${statusClass}">${escapeHtml(status)}</span>` : "-"}</td>
      <td data-label="${escapeHtml(L.colLastUpdate)}">${escapeHtml(it.latest_date || "-")}</td>
    </tr>`;
  }).join("");

  return html(layout({
    title: L.dailyItemsHeading, user, lang, activeNav: "daily", mainClass: "daily-work-page", body: `
    ${dailyWorkSubtabs(L, "input", user)}
    <header class="daily-heading">
      <div><h2>${escapeHtml(U.write)}</h2><p class="muted">${escapeHtml(U.inputHelp)}</p></div>
    </header>
    <details class="card daily-followup daily-new" ${items.results.length ? "" : "open"}>
      <summary>${escapeHtml(L.newItemHeading)}</summary>
      <form method="post" action="/daily-items/new" class="daily-form">
        <div class="field-grid">
          ${combinedEntry ? "" : `<div><label>${escapeHtml(L.colTitle)}</label><input name="title" required></div>`}
          <div><label>${escapeHtml(L.colAssignee)}</label><input value="${escapeHtml(user.display_name)}" readonly aria-readonly="true"></div>
        </div>
        ${combinedEntry ? `
        <div class="field-grid">
          <div><label>${escapeHtml(L.filterDate)}</label>
          <input type="date" name="report_date" value="${businessDateString()}" required></div>
          ${reportInputs}
        </div>` : `
        <div class="row">
          <div><label>${escapeHtml(L.colPart)}</label>
            <select name="part" required>
              <option value="SSD">SSD</option>
              <option value="Module">Module</option>
            </select>
          </div>
          <div><label>${escapeHtml(L.colCategory)}</label><select name="category"><option value=""></option>${categorySelectOptions}</select></div>
        </div>`}
        <div class="daily-form-actions"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </details>
    <div class="card daily-part daily-list">
      <div class="daily-part-head"><h3>${escapeHtml(L.itemListHeading)}</h3><span class="daily-count">${items.results.length}</span></div>
      <form method="get" action="/daily-items" class="daily-filter">
        <div>
          <label>${escapeHtml(L.filterPart)}</label>
          <select name="part">
            <option value="all" ${selectedPart === "all" ? "selected" : ""}>${escapeHtml(L.filterPartAll)}</option>
            <option value="SSD" ${selectedPart === "SSD" ? "selected" : ""}>SSD</option>
            <option value="Module" ${selectedPart === "Module" ? "selected" : ""}>Module</option>
          </select>
        </div>
        <div>
          <label>${escapeHtml(L.colStatus)}<select name="active"><option value="1" ${activeOnly ? "selected" : ""}>${escapeHtml(L.activeOnly)}</option><option value="0" ${!activeOnly ? "selected" : ""}>${escapeHtml(U.allItems)}</option></select></label>
        </div>
        <div><button type="submit">${escapeHtml(L.filterApply)}</button></div>
      </form>
      <table class="daily-item-table">
        <thead><tr>
          <th>${escapeHtml(L.colPart)}</th>
          <th>${escapeHtml(L.colCategory)}</th>
          <th>${escapeHtml(L.colTitle)}</th>
          <th>${escapeHtml(L.colAssignee)}</th>
          <th>${escapeHtml(L.colLatestStatus)}</th>
          <th>${escapeHtml(L.colLastUpdate)}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">${escapeHtml(L.noItems)}</td></tr>`}</tbody>
      </table>
    </div>
    ${combinedEntry ? CASCADING_SELECT_SCRIPT + dailyClassificationScript() + lotScript(lang) : ""}` }));
}

export async function handleDailyItemCreate(request, env, user) {
  const form = await request.formData();
  const { fields } = await loadDailyFields(env);
  const combinedEntry = hasDailyClassification(fields);
  const classificationValue = (label) => String(form.get(`field_${fields.find((field) => field.label === label)?.id}`) || "").trim();
  const part = combinedEntry ? classificationValue(DAILY_CLASSIFICATION_FIELDS[0]) : String(form.get("part") || "");
  const rawCategory = combinedEntry ? classificationValue(DAILY_CLASSIFICATION_FIELDS[1]) : String(form.get("category") || "").trim();
  const category = combinedEntry ? (rawCategory || null) : (WORK_CATEGORIES.includes(rawCategory) ? rawCategory : null);
  const owner = String(user.display_name || "").trim() || null;
  if (!["SSD", "Module"].includes(part)) return redirect("/daily-items");

  if (combinedEntry) {
    // 제목은 자유 입력이 아니라 saveDailyUpdate 내부에서 분류·파트넘버로 조합한다.
    return saveDailyUpdate(env, user, form, fields, t(getLang(request)), null, { part, category, owner });
  }
  const title = String(form.get("title") || "").trim();
  if (!title) return redirect("/daily-items");
  await warmTranslationCache(env, [title]);
  await env.DB.prepare(
    `INSERT INTO tech_daily_item (part, category, title, owner, created_by) VALUES (?, ?, ?, ?, ?)`
  ).bind(part, category, title, owner, user.id).run();

  return redirect("/daily-items");
}


export async function pageDailyItemDetail(request, env, user, id) {
  const lang = getLang(request);
  const L = t(lang);
  const item = await env.DB.prepare(`SELECT * FROM tech_daily_item WHERE id = ?`).bind(id).first();
  if (!item) return html(layout({ title: L.notFoundTitle, user, lang, body: `<div class="card">${escapeHtml(L.itemNotFound)}</div>` }), 404);

  const { fields, optionValueById } = await loadDailyFields(env, true);

  const updates = await env.DB.prepare(
    `SELECT du.*, u.display_name FROM tech_daily_update du LEFT JOIN techops_users u ON u.id = du.author_id
      WHERE du.item_id = ? ORDER BY du.report_date DESC, du.id DESC`
  ).bind(id).all();

  const values = updates.results.length ? await env.DB.prepare(
    `SELECT * FROM tech_daily_update_value WHERE update_id IN (${updates.results.map(() => "?").join(",")})`
  ).bind(...updates.results.map((u) => u.id)).all() : { results: [] };
  const valuesByUpdate = {};
  for (const v of values.results) {
    (valuesByUpdate[v.update_id] ||= {})[v.field_id] = v;
  }
  const fieldById = Object.fromEntries(fields.map((f) => [f.id, f]));
  const detailTranslations = await buildDisplayTranslationMap(env, [
    item.title,
    ...fields.filter((field) => !((lang === "en" && field.label_en) || (lang === "vi" && field.label_vi))).map((field) => field.label),
    ...fields.flatMap((field) => field.options.map((option) => option.value)),
    ...values.results.filter((row) => {
      const field = fieldById[row.field_id];
      if (isIdentifierField(field)) return false;
      return field?.input_type === "select"
        || (lang === "en" && !row.value_en)
        || (lang === "vi" && !row.value_vi);
    }).map((row) => row.value),
  ], lang);
  const displayValue = (row) => {
    const field = fieldById[row.field_id];
    if (isIdentifierField(field)) return row.value;
    return field?.input_type === "select"
      ? resolveOptionValue(row.value, lang, detailTranslations, field?.label === "상태")
      : resolveValueText(row, lang, detailTranslations);
  };

  const updateRows = updates.results.map((u) => {
    const vals = valuesByUpdate[u.id] || {};
    const lines = Object.entries(vals)
      .map(([fieldId, row]) => [fieldId, displayValue(row)])
      .filter(([, v]) => v)
      .map(([fieldId, v]) => `<div class="muted">${escapeHtml(fieldById[fieldId] ? resolveFieldLabel(fieldById[fieldId], lang, detailTranslations) : "-")}: ${escapeHtml(v).replace(/\n/g, "<br>")}</div>`)
      .join("");
    return `
    <div class="daily-history-entry">
      <div class="daily-history-meta">${escapeHtml(u.report_date)} · ${escapeHtml(u.display_name || L.unknown)}</div>
      <div class="daily-history-lines">${lines}</div>
      ${user.role === "admin" ? `<form method="post" action="/daily-items/${item.id}/updates/${u.id}/delete" data-confirm="${escapeHtml(L.deleteDailyUpdateConfirm)}" onsubmit="return confirm(this.dataset.confirm);">
        <button type="submit" class="danger small">${escapeHtml(L.deleteDailyUpdateBtn)}</button>
      </form>` : ""}
    </div>`;
  }).join("");

  const today = new Date().toISOString().slice(0, 10);
  const fieldInputs = activeDailyFields(fields).map((f) => `
        <div><label>${escapeHtml(resolveFieldLabel(f, lang, detailTranslations))}</label>
        ${renderFieldInput(f, L, "", optionValueById, lang, detailTranslations)}</div>`).join("\n");
  const itemTitle = translatedText(item.title, detailTranslations);

  return html(layout({
    title: `${item.part} · ${itemTitle}`, user, lang, activeNav: "daily", mainClass: "daily-work-page", body: `
    <p class="daily-back"><a href="/daily-items">${escapeHtml(L.backToList)}</a></p>
    <div class="card daily-item-head${item.closed_at ? " is-closed" : ""}">
      <div class="daily-item-title">
        <h2>${escapeHtml(item.part)} · ${escapeHtml(itemTitle)}</h2>
        <p class="muted">${escapeHtml(resolveOptionValue(item.category || "-", lang, detailTranslations))} · ${escapeHtml(L.colAssignee)}: ${escapeHtml(item.owner || "-")}</p>
        ${item.closed_at ? `<p class="muted daily-closed-note">${escapeHtml(L.itemClosedNotice)}</p>` : ""}
      </div>
      <div class="daily-item-actions">
        <form method="post" action="/daily-items/${item.id}/close">
          <button type="submit" class="secondary">${escapeHtml(item.closed_at ? L.reopenItemBtn : L.closeItemBtn)}</button>
        </form>
        ${user.role === "admin" ? `<form method="post" action="/daily-items/${item.id}/delete" data-confirm="${escapeHtml(L.deleteDailyItemConfirm)}" onsubmit="return confirm(this.dataset.confirm);">
          <button type="submit" class="danger small">${escapeHtml(L.deleteDailyItemBtn)}</button>
        </form>` : ""}
      </div>
    </div>
    <div class="card daily-part">
      <div class="daily-part-head"><h3>${escapeHtml(L.addUpdateHeading)}</h3></div>
      <p class="muted">${escapeHtml(L.inputTranslationNotice)}</p>
      <form method="post" action="/daily-items/${item.id}/updates" class="daily-form">
        <div class="field-grid">
          <div><label>${escapeHtml(L.filterDate)}</label>
          <input type="date" name="report_date" value="${today}" required></div>
          ${fieldInputs}
        </div>
        <div class="daily-form-actions"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </div>
    <div class="card daily-part">
      <div class="daily-part-head"><h3>${escapeHtml(L.updateHistoryHeading)}</h3><span class="daily-count">${updates.results.length}</span></div>
      ${updateRows || `<p class="muted">${escapeHtml(L.noUpdates)}</p>`}
    </div>
    ${CASCADING_SELECT_SCRIPT}
    ${dailyClassificationScript()}${lotScript(lang)}` }));
}

export async function handleDailyItemAddUpdate(request, env, user, id) {
  const lang = getLang(request);
  const L = t(lang);
  const item = await env.DB.prepare(`SELECT id FROM tech_daily_item WHERE id = ?`).bind(id).first();
  if (!item) return redirect("/daily-items");

  const form = await request.formData();
  const { fields } = await loadDailyFields(env);
  return saveDailyUpdate(env, user, form, fields, L, id);
}

async function saveDailyUpdate(env, user, form, fields, L, id, newItem = null) {
  const lotField = fields.find(f => f.label === "LOTID");
  if (lotField) {
    try { form.set(`field_${lotField.id}`, normalizeLotIds(form.get(`field_${lotField.id}`) || "")); }
    catch { return plainText("LOTID: maximum 50 lines / 120 characters per ID", 400); }
  }
  const requestedDate = String(form.get("report_date") || "").trim();
  const reportDate = requestedDate || businessDateString();
  if (!isValidIsoDate(reportDate)) return plainText(L.invalidReportDate, 400);
  const classificationFields = DAILY_CLASSIFICATION_FIELDS.map((label) => fields.find((candidate) => candidate.label === label));
  const submittedClassification = classificationFields.map((field) => {
    return field ? String(form.get(`field_${field.id}`) || "").trim() : "";
  });
  if (classificationFields.every(Boolean) && !isValidClassification(submittedClassification)) {
    return plainText("일일보고 분류 조합이 설정 기준과 일치하지 않습니다.", 400);
  }
  if (newItem) {
    // 새 항목 제목은 더 이상 자유 입력을 받지 않고 분류·추가입력·파트넘버 매칭 결과로
    // 서버가 조합한다(2026-09-16, 담당자마다 제목을 다르게 적어 보고가 흩어지는 문제 해결).
    // 원본 분류값 "Module"은 이 제목에서만 원래 엑셀 표기인 "MDL"로 되돌린다 — 사이트
    // 전역에서 쓰는 "Module" 표시는 그대로 두고 제목 조합에서만 축약한다.
    const fieldValue = (label) => {
      const field = fields.find((candidate) => candidate.label === label);
      return field ? String(form.get(`field_${field.id}`) || "").trim() : "";
    };
    const [dept, workCategory, , midClass, subClass] = submittedClassification;
    const deptLabel = dept === "Module" ? "MDL" : dept;
    const classificationLabel = [subClass, midClass, workCategory].filter(Boolean).join(" ");
    const additionalInput = fieldValue("추가입력");
    const productMatch = await describePartNumberMatches(env, fieldValue("파트넘버"));
    const titleSegments = [deptLabel, classificationLabel, additionalInput, productMatch].filter(Boolean);
    newItem = { ...newItem, title: titleSegments.map((segment) => `[${segment}]`).join(" ") };
  }
  const entries = fields
    .map((f) => {
      const value = String(form.get(`field_${f.id}`) || "").trim();
      const validValue = f.input_type !== "select" || !value || f.options.some((option) => option.value === value)
        ? value
        : "";
      return { field: f, value: validValue };
    })
    .filter((e) => e.value);

  if (entries.length) {
    await warmTranslationCache(env, entries
      .filter((entry) => entry.field.input_type === "select" && !(entry.field.label === "상태" && normalizeDailyStatusCode(entry.value)))
      .map((entry) => entry.value));
    // 식별값·숫자는 원문 보존. 자유 텍스트는 D1 캐시와 요청 내 Promise를 재사용한다.
    const translations = new Map();
    const resolved = await Promise.all(entries.map(async (e) => {
      if (isIdentifierField(e.field)) return { fieldId: e.field.id, ko: e.value, en: e.value, vi: e.value };
      if (e.field.input_type === "select" || !/\p{L}/u.test(e.value)) {
        const statusCode = e.field.label === "상태" ? normalizeDailyStatusCode(e.value) : null;
        const storedValue = statusCode || e.value;
        const standard = statusCode ? DAILY_STATUS_LABELS[statusCode] : STANDARD_OPTION_LABELS[e.value];
        return {
          fieldId: e.field.id,
          ko: storedValue,
          en: statusCode ? storedValue : (standard?.en || e.value),
          vi: statusCode ? storedValue : (standard?.vi || e.value),
        };
      }
      if (!translations.has(e.value)) translations.set(e.value, resolveTrilingualText(env, e.value));
      const tri = await translations.get(e.value);
      return { fieldId: e.field.id, ko: tri.ko || e.value, en: tri.en, vi: tri.vi };
    }));

    const statements = [];
    if (newItem) {
      await warmTranslationCache(env, [newItem.title]);
      statements.push(env.DB.prepare(
        `INSERT INTO tech_daily_item (part, category, title, owner, created_by) VALUES (?, ?, ?, ?, ?)`
      ).bind(newItem.part, newItem.category, newItem.title, newItem.owner, user.id));
    }
    statements.push(newItem
      ? env.DB.prepare(`INSERT INTO tech_daily_update (item_id, report_date, author_id) VALUES ((SELECT MAX(id) FROM tech_daily_item), ?, ?)`).bind(reportDate, user.id)
      : env.DB.prepare(`INSERT INTO tech_daily_update (item_id, report_date, author_id) VALUES (?, ?, ?)`).bind(id, reportDate, user.id));
    // Both IDs are AUTOINCREMENT. Within this single D1 transaction, MAX(id)
    // identifies the just-inserted parent; other requests cannot interleave writes.
    // Unlike last_insert_rowid(), the update ID remains stable after value inserts.
    statements.push(...resolved.map((r) => env.DB.prepare(
      `INSERT INTO tech_daily_update_value (update_id, field_id, value, value_en, value_vi)
       VALUES ((SELECT MAX(id) FROM tech_daily_update), ?, ?, ?, ?)`
    ).bind(r.fieldId, r.ko, r.en, r.vi)));
    const results = await env.DB.batch(statements);
    if (newItem) id = results[0].meta.last_row_id;
  }

  return redirect(`/daily-items/${id}`);
}

export async function handleDailyItemDelete(request, env, user, id, updateId = null) {
  const lang = getLang(request);
  if (user.role !== "admin") return forbiddenResponse(user, lang, t(lang));
  // Foreign-key cascades remove the dependent values atomically with their parent.
  if (updateId !== null) {
    await env.DB.prepare(`DELETE FROM tech_daily_update WHERE id = ? AND item_id = ?`).bind(updateId, id).run();
    return redirect(`/daily-items/${id}`);
  }
  await env.DB.prepare(`DELETE FROM tech_daily_item WHERE id = ?`).bind(id).run();
  return redirect("/daily-items");
}

export async function handleDailyItemClose(request, env, user, id) {
  const item = await env.DB.prepare(`SELECT closed_at FROM tech_daily_item WHERE id = ?`).bind(id).first();
  if (!item) return redirect("/daily-items");

  const nextClosedAt = item.closed_at ? null : new Date().toISOString().replace("Z", "");
  await env.DB.prepare(`UPDATE tech_daily_item SET closed_at = ? WHERE id = ?`).bind(nextClosedAt, id).run();

  return redirect(`/daily-items/${id}`);
}

// #endregion