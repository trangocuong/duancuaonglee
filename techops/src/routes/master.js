import {
  escapeHtml, html, redirect,
} from "../utils/helpers.js";
import {
  layout, forbiddenResponse,
} from "../views/layout.js";
import {
  getLang, t,
} from "../i18n/index.js";

// #region 기준정보 (Master Data)
// 일일업무(EAV)와 달리 행당 JSON(data_json) 구조다 — §master_schema.sql 설계 근거 참고.
// field.code는 여기서만 json_extract() SQL 문자열에 직접 이어붙이므로(값은 전부 바인딩),
// 저장 시 MASTER_CODE_RE로 검증해 항상 안전한 문자만 들어오게 강제한다.

export const MASTER_PAGE_SIZE = 50;
// 기준정보 화면도 일일업무 화면과 같은 조밀한 카드·도구막대 디자인을 쓴다(2026-10-04).
export const MASTER_MAIN_CLASS = "daily-work-page master-page";
export const MASTER_DATA_TYPES = ["TEXT", "NUMBER", "SELECT", "YN", "DATE"];
export const MASTER_CODE_RE = /^[A-Z][A-Z0-9_]*$/;

export function masterSetName(set, lang) {
  return set[`name_${lang}`] || set.name_ko;
}

export function masterFieldLabel(field, lang) {
  return field[`label_${lang}`] || field.label_ko;
}

export function masterTypeLabel(dataType, L) {
  return { TEXT: L.masterTypeText, NUMBER: L.masterTypeNumber, SELECT: L.masterTypeSelect, YN: L.masterTypeYn, DATE: L.masterTypeDate }[dataType] || dataType;
}

export function verifyStatusBadge(status, L) {
  const cls = status === "ERROR" ? "issue" : status === "OK" ? "done" : "";
  const text = status === "ERROR" ? L.verifyStatusError : status === "CHECK" ? L.verifyStatusCheck : L.verifyStatusOk;
  return `<span class="status-pill ${cls}">${escapeHtml(text)}</span>`;
}

export function masterTypeOptions(selected, L) {
  return MASTER_DATA_TYPES.map((dt) => `<option value="${dt}" ${selected === dt ? "selected" : ""}>${escapeHtml(masterTypeLabel(dt, L))}</option>`).join("");
}

export async function loadMasterFields(env, setId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM tech_master_field WHERE set_id = ? AND active = 1 ORDER BY sort_order, id`
  ).bind(setId).all();
  return results;
}

export async function loadMasterSet(env, code) {
  return env.DB.prepare(`SELECT * FROM tech_master_set WHERE code = ?`).bind(code).first();
}

export async function masterRowCount(env, setId) {
  const { count } = await env.DB.prepare(`SELECT COUNT(*) AS count FROM tech_master_row WHERE set_id = ?`).bind(setId).first();
  return count;
}

// 현재 쿼리스트링을 복사해 일부 값만 바꾼 뒤 문자열로 돌려준다(정렬·페이지 링크용).
// 값에 null을 주면 그 키를 아예 지운다(예: 정렬 기준이 바뀌면 page는 1로 리셋).
export function masterQueryString(url, overrides) {
  const params = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function masterNotFoundPage(user, lang, L, message) {
  return html(layout({ title: message, user, lang, activeNav: "master-data", body: `<div class="card">${escapeHtml(message)}</div>` }), 404);
}

export async function pageMasterIndex(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  const [{ results: sets }, { results: countRows }] = await Promise.all([
    env.DB.prepare(`SELECT * FROM tech_master_set WHERE active = 1 ORDER BY sort_order, id`).all(),
    env.DB.prepare(`SELECT set_id, COUNT(*) AS count FROM tech_master_row GROUP BY set_id`).all(),
  ]);
  const countBySet = new Map(countRows.map((row) => [row.set_id, row.count]));

  const cards = [];
  for (const set of sets) {
    const count = countBySet.get(set.id) || 0;
    cards.push(`<a href="/master/${escapeHtml(set.code)}" class="card master-set-card">
      <span class="master-set-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg></span>
      <h3>${escapeHtml(masterSetName(set, lang))}</h3>
      <p class="muted">${escapeHtml(set.description || "")}</p>
      <p class="master-count">${count}<span> ${escapeHtml(L.masterRowCountLabel)}</span></p>
    </a>`);
  }

  return html(layout({
    title: L.masterIndexHeading,
    user, lang, activeNav: "master-data", mainClass: MASTER_MAIN_CLASS,
    body: `<header class="daily-heading">
      <div><h2>${escapeHtml(L.masterIndexHeading)}</h2></div>
      ${user.role === "admin" ? `<a class="daily-secondary" href="/master/setup">${escapeHtml(L.masterManageBtn)}</a>` : ""}
    </header>
    <div class="master-sets">${cards.join("") || `<p class="muted">${escapeHtml(L.masterNoResults)}</p>`}</div>`
  }));
}

export async function pageMasterList(request, env, user, code) {
  const lang = getLang(request);
  const L = t(lang);
  const url = new URL(request.url);

  const set = await loadMasterSet(env, code);
  if (!set || !set.active) return masterNotFoundPage(user, lang, L, L.masterSetNotFound);

  const fields = await loadMasterFields(env, set.id);
  const listFields = fields.filter((f) => f.show_in_list);
  const selectListFields = listFields.filter((f) => f.data_type === "SELECT");

  const q = url.searchParams.get("q") || "";
  const statusFilter = url.searchParams.get("status") || "";
  const sortCode = url.searchParams.get("sort") || "";
  const sortDir = url.searchParams.get("dir") === "desc" ? "DESC" : "ASC";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);

  const fieldFilters = selectListFields
    .map((f) => ({ field: f, value: url.searchParams.get(`f_${f.code}`) || "" }))
    .filter((x) => x.value);

  const where = ["set_id = ?", "active = 1"];
  const params = [set.id];
  if (q) { where.push("data_json LIKE ?"); params.push(`%${q}%`); }
  if (statusFilter) { where.push("verify_status = ?"); params.push(statusFilter); }
  for (const { field, value } of fieldFilters) {
    where.push(`json_extract(data_json, '$.${field.code}') = ?`);
    params.push(value);
  }
  const whereSql = where.join(" AND ");

  // 필터 드롭다운은 하드코딩하지 않고 현재 데이터에서 DISTINCT로 뽑는다(요구사항).
  const [{ count: totalCount }, ...filterOptionResults] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM tech_master_row WHERE ${whereSql}`).bind(...params).first(),
    ...selectListFields.map((f) => env.DB.prepare(
      `SELECT DISTINCT json_extract(data_json, '$.${f.code}') AS v FROM tech_master_row
        WHERE set_id = ? AND active = 1 AND json_extract(data_json, '$.${f.code}') IS NOT NULL AND json_extract(data_json, '$.${f.code}') != ''
        ORDER BY v`
    ).bind(set.id).all()),
  ]);
  const filterOptionsByCode = Object.fromEntries(
    selectListFields.map((f, index) => [f.code, filterOptionResults[index].results.map((o) => o.v)])
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / MASTER_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * MASTER_PAGE_SIZE;

  const sortField = fields.find((f) => f.code === sortCode);
  const orderSql = sortField ? `json_extract(data_json, '$.${sortField.code}') ${sortDir}` : `row_key ASC`;

  const { results: rows } = await env.DB.prepare(
    `SELECT * FROM tech_master_row WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`
  ).bind(...params, MASTER_PAGE_SIZE, offset).all();

  const filterForm = `<form method="get" action="/master/${escapeHtml(set.code)}" class="daily-filter">
    <div><label>${escapeHtml(L.masterSearchLabel)}</label><input type="text" name="q" value="${escapeHtml(q)}" placeholder="${escapeHtml(L.masterSearchPlaceholder)}"></div>
    ${selectListFields.map((f) => {
      const current = fieldFilters.find((x) => x.field.code === f.code)?.value || "";
      return `<div><label>${escapeHtml(masterFieldLabel(f, lang))}</label>
        <select name="f_${escapeHtml(f.code)}">
          <option value="">${escapeHtml(L.filterPartAll)}</option>
          ${(filterOptionsByCode[f.code] || []).map((v) => `<option value="${escapeHtml(v)}" ${v === current ? "selected" : ""}>${escapeHtml(v)}</option>`).join("")}
        </select></div>`;
    }).join("")}
    <div><label>${escapeHtml(L.verifyStatusLabel)}</label>
      <select name="status">
        <option value="">${escapeHtml(L.filterPartAll)}</option>
        <option value="OK" ${statusFilter === "OK" ? "selected" : ""}>${escapeHtml(L.verifyStatusOk)}</option>
        <option value="CHECK" ${statusFilter === "CHECK" ? "selected" : ""}>${escapeHtml(L.verifyStatusCheck)}</option>
        <option value="ERROR" ${statusFilter === "ERROR" ? "selected" : ""}>${escapeHtml(L.verifyStatusError)}</option>
      </select></div>
    <div><button type="submit">${escapeHtml(L.filterApply)}</button></div>
  </form>`;

  const headerCells = listFields.map((f) => {
    const nextDir = sortCode === f.code && sortDir === "ASC" ? "desc" : "asc";
    const arrow = sortCode === f.code ? (sortDir === "ASC" ? " ▲" : " ▼") : "";
    const href = `/master/${escapeHtml(set.code)}${masterQueryString(url, { sort: f.code, dir: nextDir, page: null })}`;
    return `<th><a href="${href}" class="master-sort${arrow ? " is-active" : ""}">${escapeHtml(masterFieldLabel(f, lang))}${arrow}</a></th>`;
  }).join("");

  const bodyRows = rows.map((row) => {
    let data = {};
    try { data = JSON.parse(row.data_json); } catch (e) { data = {}; }
    const cells = listFields.map((f, i) => {
      const content = escapeHtml(String(data[f.code] ?? "") || "-");
      return i === 0
        ? `<td><a href="/master/${escapeHtml(set.code)}/row/${row.id}">${content}</a></td>`
        : `<td>${content}</td>`;
    }).join("");
    return `<tr>${cells}<td>${verifyStatusBadge(row.verify_status, L)}</td></tr>`;
  }).join("");

  const prevHref = currentPage > 1 ? `/master/${escapeHtml(set.code)}${masterQueryString(url, { page: currentPage - 1 })}` : null;
  const nextHref = currentPage < totalPages ? `/master/${escapeHtml(set.code)}${masterQueryString(url, { page: currentPage + 1 })}` : null;

  return html(layout({
    title: masterSetName(set, lang),
    user, lang, activeNav: "master-data", mainClass: MASTER_MAIN_CLASS,
    body: `<header class="daily-heading">
      <div><h2>${escapeHtml(masterSetName(set, lang))} <span class="daily-count">${totalCount}</span></h2>
      <p class="muted">${escapeHtml(set.description || "")}</p></div>
      <a class="daily-secondary" href="/master">${escapeHtml(L.backToList)}</a>
    </header>
    <div class="card daily-toolbar">
      ${filterForm}
    </div>
    <div class="card table-card">
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>${headerCells}<th>${escapeHtml(L.verifyStatusLabel)}</th></tr></thead>
          <tbody>${bodyRows || `<tr><td colspan="${listFields.length + 1}" class="muted">${escapeHtml(L.masterNoResults)}</td></tr>`}</tbody>
        </table>
      </div>
      <div class="master-pager">
        <span>${prevHref ? `<a class="daily-secondary" href="${prevHref}">← ${escapeHtml(L.masterPrevPage)}</a>` : ""}</span>
        <span class="muted">${currentPage} / ${totalPages}</span>
        <span>${nextHref ? `<a class="daily-secondary" href="${nextHref}">${escapeHtml(L.masterNextPage)} →</a>` : ""}</span>
      </div>
    </div>`
  }));
}

export async function pageMasterRowDetail(request, env, user, code, id) {
  const lang = getLang(request);
  const L = t(lang);
  const set = await loadMasterSet(env, code);
  if (!set) return masterNotFoundPage(user, lang, L, L.masterSetNotFound);

  const row = await env.DB.prepare(`SELECT * FROM tech_master_row WHERE id = ? AND set_id = ?`).bind(id, set.id).first();
  if (!row) return masterNotFoundPage(user, lang, L, L.masterNotFound);

  const fields = await loadMasterFields(env, set.id);
  let data = {};
  try { data = JSON.parse(row.data_json); } catch (e) { data = {}; }

  const fieldRows = fields.map((f) =>
    `<tr><th>${escapeHtml(masterFieldLabel(f, lang))}</th><td>${escapeHtml(String(data[f.code] ?? "") || "-")}</td></tr>`
  ).join("");

  return html(layout({
    title: `${masterSetName(set, lang)} · ${row.row_key}`,
    user, lang, activeNav: "master-data", mainClass: MASTER_MAIN_CLASS,
    body: `<header class="daily-heading">
      <div><h2>${escapeHtml(L.masterDetailHeading)} — ${escapeHtml(row.row_key)}</h2>
      <p class="master-verify">${verifyStatusBadge(row.verify_status, L)} ${row.verify_note ? `<span class="muted">${escapeHtml(row.verify_note)}</span>` : ""}</p></div>
      <a class="daily-secondary" href="/master/${escapeHtml(set.code)}">${escapeHtml(L.backToList)}</a>
    </header>
    <div class="card daily-part">
      <div class="daily-part-head"><h3>${escapeHtml(masterSetName(set, lang))}</h3></div>
      <table class="master-fields">${fieldRows}</table>
    </div>
    <div class="card daily-part">
      <div class="daily-part-head"><h3>${escapeHtml(L.masterHistoryHeading)}</h3></div>
      <p class="muted">${escapeHtml(L.masterHistoryComingSoon)}</p>
    </div>`
  }));
}

export async function pageMasterSetup(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const { results: sets } = await env.DB.prepare(`SELECT * FROM tech_master_set ORDER BY sort_order, id`).all();
  const rowsHtml = sets.map((set) => `<tr>
    <td><a href="/master/setup/${escapeHtml(set.code)}">${escapeHtml(set.code)}</a></td>
    <td>${escapeHtml(masterSetName(set, lang))}</td>
    <td class="master-flag">${set.active ? "✓" : "-"}</td>
  </tr>`).join("");

  return html(layout({
    title: L.masterSetupHeading,
    user, lang, activeNav: "master-data", mainClass: MASTER_MAIN_CLASS,
    body: `<div class="card daily-part">
      <div class="daily-part-head"><h3>${escapeHtml(L.masterNewSetHeading)}</h3></div>
      <form method="post" action="/master/setup/new" class="daily-form master-form">
        <div class="row">
          <div><label>${escapeHtml(L.masterSetCodeLabel)}</label><input name="code" required placeholder="EX: FIXTURE_DB"></div>
          <div><label>${escapeHtml(L.masterReviewCycleLabel)}</label><input name="review_cycle_days" type="number" value="90"></div>
        </div>
        <div class="row">
          <div><label>${escapeHtml(L.masterSetNameKoLabel)}</label><input name="name_ko" required></div>
          <div><label>${escapeHtml(L.masterSetNameEnLabel)}</label><input name="name_en" required></div>
          <div><label>${escapeHtml(L.masterSetNameViLabel)}</label><input name="name_vi" required></div>
        </div>
        <div><label>${escapeHtml(L.masterSetDescLabel)}</label><textarea name="description"></textarea></div>
        <div class="daily-form-actions"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </div>
    <div class="card daily-part daily-list">
      <div class="daily-part-head"><h3>${escapeHtml(L.masterSetupHeading)}</h3><span class="daily-count">${sets.length}</span></div>
      <table class="data-table">
        <thead><tr><th>${escapeHtml(L.masterSetCodeLabel)}</th><th>${escapeHtml(L.displayName)}</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`
  }));
}

export async function handleMasterSetCreate(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const form = await request.formData();
  const code = String(form.get("code") || "").trim().toUpperCase();
  const nameKo = String(form.get("name_ko") || "").trim();
  const nameEn = String(form.get("name_en") || "").trim();
  const nameVi = String(form.get("name_vi") || "").trim();
  const description = String(form.get("description") || "").trim() || null;
  const reviewCycleDays = parseInt(form.get("review_cycle_days"), 10) || 90;

  if (!MASTER_CODE_RE.test(code) || !nameKo || !nameEn || !nameVi) return redirect("/master/setup");

  const existing = await loadMasterSet(env, code);
  if (existing) return redirect("/master/setup");

  const { max } = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order),0) AS max FROM tech_master_set`).first();
  await env.DB.prepare(
    `INSERT INTO tech_master_set (code, name_ko, name_en, name_vi, description, review_cycle_days, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(code, nameKo, nameEn, nameVi, description, reviewCycleDays, max + 10).run();

  return redirect(`/master/setup/${code}`);
}

export async function handleMasterSetUpdate(request, env, user, code) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  if (!set) return redirect("/master/setup");

  const form = await request.formData();
  const nameKo = String(form.get("name_ko") || "").trim() || set.name_ko;
  const nameEn = String(form.get("name_en") || "").trim() || set.name_en;
  const nameVi = String(form.get("name_vi") || "").trim() || set.name_vi;
  const description = String(form.get("description") || "").trim() || null;
  const reviewCycleDays = parseInt(form.get("review_cycle_days"), 10) || set.review_cycle_days;

  await env.DB.prepare(
    `UPDATE tech_master_set SET name_ko=?, name_en=?, name_vi=?, description=?, review_cycle_days=?, updated_at=datetime('now') WHERE id=?`
  ).bind(nameKo, nameEn, nameVi, description, reviewCycleDays, set.id).run();

  return redirect(`/master/setup/${set.code}`);
}

export async function pageMasterSetDetail(request, env, user, code) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  if (!set) return masterNotFoundPage(user, lang, L, L.masterSetNotFound);

  const rowCount = await masterRowCount(env, set.id);
  const { results: fields } = await env.DB.prepare(`SELECT * FROM tech_master_field WHERE set_id = ? ORDER BY sort_order, id`).bind(set.id).all();

  const fieldRows = fields.map((f, i) => `<tr>
    <td><a href="/master/setup/${escapeHtml(set.code)}/fields/${f.id}">${escapeHtml(f.code)}</a></td>
    <td>${escapeHtml(masterFieldLabel(f, lang))}</td>
    <td>${escapeHtml(masterTypeLabel(f.data_type, L))}</td>
    <td class="master-flag">${f.required ? "✓" : "-"}</td>
    <td class="master-flag">${f.is_key ? "✓" : "-"}</td>
    <td class="master-flag">${f.show_in_list ? "✓" : "-"}</td>
    <td class="master-actions">
      <form method="post" action="/master/setup/${escapeHtml(set.code)}/fields/${f.id}/move" class="inline">
        <input type="hidden" name="direction" value="up"><button type="submit" class="secondary small" ${i === 0 ? "disabled" : ""}>▲</button>
      </form>
      <form method="post" action="/master/setup/${escapeHtml(set.code)}/fields/${f.id}/move" class="inline">
        <input type="hidden" name="direction" value="down"><button type="submit" class="secondary small" ${i === fields.length - 1 ? "disabled" : ""}>▼</button>
      </form>
      <form method="post" action="/master/setup/${escapeHtml(set.code)}/fields/${f.id}/delete" class="inline" onsubmit="return confirm('${escapeHtml(L.deleteOptionConfirm)}');">
        <button type="submit" class="danger small">${escapeHtml(L.deleteBtn)}</button>
      </form>
    </td>
  </tr>`).join("");

  return html(layout({
    title: masterSetName(set, lang),
    user, lang, activeNav: "master-data", mainClass: MASTER_MAIN_CLASS,
    body: `<header class="daily-heading">
      <div><h2>${escapeHtml(masterSetName(set, lang))}</h2>
      ${rowCount > 0 ? `<p class="muted notice-pill">${escapeHtml(L.masterFieldLockedNotice)}</p>` : ""}</div>
      <a class="daily-secondary" href="/master/setup">${escapeHtml(L.backToList)}</a>
    </header>
    <div class="card">
      <form method="post" action="/master/setup/${escapeHtml(set.code)}" class="daily-form master-form">
        <div><label>${escapeHtml(L.masterSetCodeLabel)}</label><input value="${escapeHtml(set.code)}" disabled></div>
        <div class="row">
          <div><label>${escapeHtml(L.masterSetNameKoLabel)}</label><input name="name_ko" value="${escapeHtml(set.name_ko)}" required></div>
          <div><label>${escapeHtml(L.masterSetNameEnLabel)}</label><input name="name_en" value="${escapeHtml(set.name_en)}" required></div>
          <div><label>${escapeHtml(L.masterSetNameViLabel)}</label><input name="name_vi" value="${escapeHtml(set.name_vi)}" required></div>
        </div>
        <div><label>${escapeHtml(L.masterSetDescLabel)}</label><textarea name="description">${escapeHtml(set.description || "")}</textarea></div>
        <div><label>${escapeHtml(L.masterReviewCycleLabel)}</label><input name="review_cycle_days" type="number" value="${set.review_cycle_days}"></div>
        <div class="daily-form-actions"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </div>
    <div class="card daily-part daily-list">
      <div class="daily-part-head"><h3>${escapeHtml(L.masterNewFieldHeading)}</h3></div>
      <form method="post" action="/master/setup/${escapeHtml(set.code)}/fields/new" class="daily-form master-form">
        <div class="row">
          <div><label>${escapeHtml(L.masterFieldCodeLabel)}</label><input name="code" required placeholder="EX: NEW_COLUMN"></div>
          <div><label>${escapeHtml(L.masterFieldTypeLabel)}</label><select name="data_type">${masterTypeOptions("TEXT", L)}</select></div>
        </div>
        <div class="row">
          <div><label>${escapeHtml(L.masterFieldLabelKoLabel)}</label><input name="label_ko" required></div>
          <div><label>${escapeHtml(L.masterFieldLabelEnLabel)}</label><input name="label_en" required></div>
          <div><label>${escapeHtml(L.masterFieldLabelViLabel)}</label><input name="label_vi" required></div>
        </div>
        <div class="row master-checks">
          <label><input type="checkbox" name="required" value="1"> ${escapeHtml(L.masterFieldRequiredLabel)}</label>
          <label><input type="checkbox" name="is_key" value="1"> ${escapeHtml(L.masterFieldKeyLabel)}</label>
          <label><input type="checkbox" name="show_in_list" value="1" checked> ${escapeHtml(L.masterFieldShowInListLabel)}</label>
        </div>
        <div class="daily-form-actions"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
      <table class="data-table">
        <thead><tr><th>${escapeHtml(L.masterFieldCodeLabel)}</th><th>${escapeHtml(L.displayName)}</th><th>${escapeHtml(L.masterFieldTypeLabel)}</th><th>${escapeHtml(L.masterFieldRequiredLabel)}</th><th>${escapeHtml(L.masterFieldKeyLabel)}</th><th>${escapeHtml(L.masterFieldShowInListLabel)}</th><th></th></tr></thead>
        <tbody>${fieldRows}</tbody>
      </table>
    </div>`
  }));
}

export async function handleMasterFieldCreate(request, env, user, code) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  if (!set) return redirect("/master/setup");

  const form = await request.formData();
  const fieldCode = String(form.get("code") || "").trim().toUpperCase();
  const labelKo = String(form.get("label_ko") || "").trim();
  const labelEn = String(form.get("label_en") || "").trim();
  const labelVi = String(form.get("label_vi") || "").trim();
  const dataType = MASTER_DATA_TYPES.includes(form.get("data_type")) ? form.get("data_type") : "TEXT";
  const required = form.get("required") ? 1 : 0;
  const isKey = form.get("is_key") ? 1 : 0;
  const showInList = form.get("show_in_list") ? 1 : 0;

  if (!MASTER_CODE_RE.test(fieldCode) || !labelKo || !labelEn || !labelVi) return redirect(`/master/setup/${set.code}`);

  const existing = await env.DB.prepare(`SELECT id FROM tech_master_field WHERE set_id = ? AND code = ?`).bind(set.id, fieldCode).first();
  if (existing) return redirect(`/master/setup/${set.code}`);

  const { max } = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order),0) AS max FROM tech_master_field WHERE set_id = ?`).bind(set.id).first();
  await env.DB.prepare(
    `INSERT INTO tech_master_field (set_id, code, label_ko, label_en, label_vi, data_type, required, is_key, show_in_list, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(set.id, fieldCode, labelKo, labelEn, labelVi, dataType, required, isKey, showInList, max + 10).run();

  return redirect(`/master/setup/${set.code}`);
}

export async function pageMasterFieldDetail(request, env, user, code, fieldId) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  const field = set ? await env.DB.prepare(`SELECT * FROM tech_master_field WHERE id = ? AND set_id = ?`).bind(fieldId, set.id).first() : null;
  if (!set || !field) return masterNotFoundPage(user, lang, L, L.masterNotFound);

  const rowCount = await masterRowCount(env, set.id);
  const locked = rowCount > 0;

  return html(layout({
    title: masterFieldLabel(field, lang),
    user, lang, activeNav: "master-data", mainClass: MASTER_MAIN_CLASS,
    body: `<header class="daily-heading">
      <div><h2>${escapeHtml(masterFieldLabel(field, lang))}</h2>
      ${locked ? `<p class="muted notice-pill">${escapeHtml(L.masterFieldLockedNotice)}</p>` : ""}</div>
      <a class="daily-secondary" href="/master/setup/${escapeHtml(set.code)}">${escapeHtml(L.backToList)}</a>
    </header>
    <div class="card">
      <form method="post" action="/master/setup/${escapeHtml(set.code)}/fields/${field.id}" class="daily-form master-form">
        <div class="row">
          <div><label>${escapeHtml(L.masterFieldCodeLabel)}</label><input name="code" value="${escapeHtml(field.code)}" ${locked ? "disabled" : ""}></div>
          <div><label>${escapeHtml(L.masterFieldTypeLabel)}</label><select name="data_type">${masterTypeOptions(field.data_type, L)}</select></div>
        </div>
        <div class="row">
          <div><label>${escapeHtml(L.masterFieldLabelKoLabel)}</label><input name="label_ko" value="${escapeHtml(field.label_ko)}"></div>
          <div><label>${escapeHtml(L.masterFieldLabelEnLabel)}</label><input name="label_en" value="${escapeHtml(field.label_en)}"></div>
          <div><label>${escapeHtml(L.masterFieldLabelViLabel)}</label><input name="label_vi" value="${escapeHtml(field.label_vi)}"></div>
        </div>
        <div class="row master-checks">
          <label><input type="checkbox" name="required" value="1" ${field.required ? "checked" : ""}> ${escapeHtml(L.masterFieldRequiredLabel)}</label>
          <label><input type="checkbox" name="is_key" value="1" ${field.is_key ? "checked" : ""} ${locked ? "disabled" : ""}> ${escapeHtml(L.masterFieldKeyLabel)}</label>
          <label><input type="checkbox" name="show_in_list" value="1" ${field.show_in_list ? "checked" : ""}> ${escapeHtml(L.masterFieldShowInListLabel)}</label>
        </div>
        <div class="daily-form-actions"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </div>`
  }));
}

export async function handleMasterFieldUpdate(request, env, user, code, fieldId) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  const field = set ? await env.DB.prepare(`SELECT * FROM tech_master_field WHERE id = ? AND set_id = ?`).bind(fieldId, set.id).first() : null;
  if (!set || !field) return redirect("/master/setup");

  const rowCount = await masterRowCount(env, set.id);
  const locked = rowCount > 0;

  const form = await request.formData();
  const labelKo = String(form.get("label_ko") || "").trim() || field.label_ko;
  const labelEn = String(form.get("label_en") || "").trim() || field.label_en;
  const labelVi = String(form.get("label_vi") || "").trim() || field.label_vi;
  const dataType = MASTER_DATA_TYPES.includes(form.get("data_type")) ? form.get("data_type") : field.data_type;
  const required = form.get("required") ? 1 : 0;
  const showInList = form.get("show_in_list") ? 1 : 0;

  // 데이터가 있으면 고유키·코드는 절대 바꾸지 않는다 — 클라이언트의 disabled 표시를
  // 우회해서 값을 보내와도 서버가 무시하고 기존 값을 그대로 유지한다.
  let fieldCode = field.code;
  let isKey = field.is_key;
  if (!locked) {
    const submittedCode = String(form.get("code") || "").trim().toUpperCase();
    if (MASTER_CODE_RE.test(submittedCode)) fieldCode = submittedCode;
    isKey = form.get("is_key") ? 1 : 0;
  }

  await env.DB.prepare(
    `UPDATE tech_master_field SET code=?, label_ko=?, label_en=?, label_vi=?, data_type=?, required=?, is_key=?, show_in_list=? WHERE id=?`
  ).bind(fieldCode, labelKo, labelEn, labelVi, dataType, required, isKey, showInList, fieldId).run();

  return redirect(`/master/setup/${set.code}/fields/${fieldId}`);
}

export async function handleMasterFieldDelete(request, env, user, code, fieldId) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  if (set) await env.DB.prepare(`DELETE FROM tech_master_field WHERE id = ? AND set_id = ?`).bind(fieldId, set.id).run();
  return redirect(`/master/setup/${code}`);
}

// 인접한 필드와 sort_order 를 맞바꾼다. handleDailyFieldMove와 같은 방식이며 set_id로 스코프만 좁혔다.
export async function handleMasterFieldMove(request, env, user, code, fieldId) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  if (!set) return redirect("/master/setup");

  const form = await request.formData();
  const direction = String(form.get("direction") || "");

  const field = await env.DB.prepare(`SELECT id, sort_order FROM tech_master_field WHERE id = ? AND set_id = ?`).bind(fieldId, set.id).first();
  if (!field) return redirect(`/master/setup/${set.code}`);

  const neighbor = direction === "up"
    ? await env.DB.prepare(
        `SELECT id, sort_order FROM tech_master_field WHERE set_id = ? AND ((sort_order < ?) OR (sort_order = ? AND id < ?)) ORDER BY sort_order DESC, id DESC LIMIT 1`
      ).bind(set.id, field.sort_order, field.sort_order, field.id).first()
    : direction === "down"
    ? await env.DB.prepare(
        `SELECT id, sort_order FROM tech_master_field WHERE set_id = ? AND ((sort_order > ?) OR (sort_order = ? AND id > ?)) ORDER BY sort_order ASC, id ASC LIMIT 1`
      ).bind(set.id, field.sort_order, field.sort_order, field.id).first()
    : null;

  if (neighbor) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE tech_master_field SET sort_order = ? WHERE id = ?`).bind(neighbor.sort_order, field.id),
      env.DB.prepare(`UPDATE tech_master_field SET sort_order = ? WHERE id = ?`).bind(field.sort_order, neighbor.id),
    ]);
  }
  return redirect(`/master/setup/${set.code}`);
}


// #endregion
export async function handleMasterRowCreate(request, env, user, code) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  if (!set || !set.active) return redirect("/master");

  const fields = await loadMasterFields(env, set.id);
  const form = await request.formData();

  const data = {};
  for (const f of fields) {
    const val = String(form.get(`field_${f.code}`) || "").trim();
    if (val) data[f.code] = val;
  }

  const keyField = fields.find(f => f.is_key);
  let rowKey = keyField && data[keyField.code] ? data[keyField.code] : String(form.get("row_key") || "").trim();
  if (!rowKey) {
    rowKey = `${set.code}_${Date.now()}`;
  }

  const verifyStatus = ["OK", "CHECK", "ERROR"].includes(form.get("verify_status")) ? form.get("verify_status") : "OK";
  const verifyNote = String(form.get("verify_note") || "").trim() || null;

  try {
    const res = await env.DB.prepare(
      `INSERT INTO tech_master_row (set_id, row_key, data_json, verify_status, verify_note, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(set.id, rowKey, JSON.stringify(data), verifyStatus, verifyNote, user.id, user.id).run();

    const rowId = res.meta?.last_row_id;
    await env.DB.prepare(
      `INSERT INTO tech_master_log (set_id, row_id, row_key, action, actor_user_id)
       VALUES (?, ?, ?, 'INSERT', ?)`
    ).bind(set.id, rowId, rowKey, user.id).run();
  } catch (err) {
    console.error("handleMasterRowCreate error:", err);
  }

  return redirect(`/master/${set.code}`);
}

export async function handleMasterRowUpdate(request, env, user, code, id) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  if (!set || !set.active) return redirect("/master");

  const row = await env.DB.prepare(`SELECT * FROM tech_master_row WHERE id = ? AND set_id = ?`).bind(id, set.id).first();
  if (!row) return redirect(`/master/${set.code}`);

  const fields = await loadMasterFields(env, set.id);
  const form = await request.formData();

  const data = {};
  for (const f of fields) {
    const val = String(form.get(`field_${f.code}`) || "").trim();
    if (val) data[f.code] = val;
  }

  const keyField = fields.find(f => f.is_key);
  let rowKey = keyField && data[keyField.code] ? data[keyField.code] : row.row_key;

  const verifyStatus = ["OK", "CHECK", "ERROR"].includes(form.get("verify_status")) ? form.get("verify_status") : row.verify_status;
  const verifyNote = String(form.get("verify_note") || "").trim() || null;

  try {
    await env.DB.prepare(
      `UPDATE tech_master_row SET row_key = ?, data_json = ?, verify_status = ?, verify_note = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ? AND set_id = ?`
    ).bind(rowKey, JSON.stringify(data), verifyStatus, verifyNote, user.id, id, set.id).run();

    await env.DB.prepare(
      `INSERT INTO tech_master_log (set_id, row_id, row_key, action, actor_user_id)
       VALUES (?, ?, ?, 'UPDATE', ?)`
    ).bind(set.id, id, rowKey, user.id).run();
  } catch (err) {
    console.error("handleMasterRowUpdate error:", err);
  }

  return redirect(`/master/${set.code}/row/${id}`);
}

export async function handleMasterRowDelete(request, env, user, code, id) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  if (!set || !set.active) return redirect("/master");

  const row = await env.DB.prepare(`SELECT * FROM tech_master_row WHERE id = ? AND set_id = ?`).bind(id, set.id).first();
  if (row) {
    await env.DB.prepare(`DELETE FROM tech_master_row WHERE id = ? AND set_id = ?`).bind(id, set.id).run();
    await env.DB.prepare(
      `INSERT INTO tech_master_log (set_id, row_id, row_key, action, actor_user_id)
       VALUES (?, ?, ?, 'DELETE', ?)`
    ).bind(set.id, id, row.row_key, user.id).run();
  }

  return redirect(`/master/${set.code}`);
}
