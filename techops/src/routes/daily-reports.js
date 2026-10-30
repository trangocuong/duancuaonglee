import {
  escapeHtml, html, redirect, isValidIsoDate, businessDateString, addDays,
} from "../utils/helpers.js";
import {
  layout, dailyWorkSubtabs,
} from "../views/layout.js";
import {
  getLang, t,
} from "../i18n/index.js";
import {
  buildDisplayTranslationMap, translateText, warmTranslationCache, translatedText,
} from "../modules/translation/translation-service.js";
import { normalizeLotIds } from "../modules/lot/lot-info.js";
import {
  loadDailyFields, activeDailyFields, hasDailyClassification, resolveOptionValue,
} from "./daily-fields.js";
import {
  attachFieldValues, getUpdateFieldMap, getUpdateRawFieldMap, firstDailyValue,
  dailyGoodDefectValues, isIssueStatus, isDoneStatus, dailyAttentionItems,
} from "../modules/daily/daily-helpers.js";

export const STALE_THRESHOLD_DAYS = 3;

export async function pageDailyReports(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  const U = L.dailyUi;
  const url = new URL(request.url);

  const dateRows = await env.DB.prepare(
    `SELECT report_date FROM tech_daily_report
     UNION SELECT report_date FROM tech_daily_update
     ORDER BY report_date DESC`
  ).all();
  const dates = dateRows.results.map((r) => r.report_date);
  const requestedDate = url.searchParams.get("date") || "";
  const yesterday = addDays(businessDateString(), -1);
  const selectedDate = dates.includes(requestedDate)
    ? requestedDate
    : dates.includes(yesterday)
      ? yesterday
      : (dates[0] || "");
  const requestedPart = url.searchParams.get("part") || "all";
  const selectedPart = ["SSD", "Module"].includes(requestedPart) ? requestedPart : "all";
  const loadLiveUpdatesForDate = async (date) => {
    if (!date) return [];
    const sql = selectedPart === "all"
      ? `SELECT u.id, u.report_date, i.id AS item_id, i.part, i.category, i.title, i.owner
           FROM tech_daily_update u JOIN tech_daily_item i ON i.id = u.item_id
          WHERE u.report_date = ? ORDER BY i.part, i.category, i.title`
      : `SELECT u.id, u.report_date, i.id AS item_id, i.part, i.category, i.title, i.owner
           FROM tech_daily_update u JOIN tech_daily_item i ON i.id = u.item_id
          WHERE u.report_date = ? AND i.part = ? ORDER BY i.category, i.title`;
    const params = selectedPart === "all" ? [date] : [date, selectedPart];
    const result = await env.DB.prepare(sql).bind(...params).all();
    return result.results.length ? attachFieldValues(env, lang, result.results) : [];
  };

  // 과거 엑셀 아카이브(tech_daily_report, 고정 컬럼)와 새로 입력되는 항목/업데이트
  // (tech_daily_item + tech_daily_update, 필드가 관리자 설정에 따라 자유롭게 바뀜)는
  // 컬럼 모양이 서로 다를 수 있어 UNION 하지 않고 두 섹션으로 나눠 보여준다.
  const reportsQuery = !selectedDate
    ? Promise.resolve({ results: [] })
    : selectedPart === "all"
      ? env.DB.prepare(
          `SELECT * FROM tech_daily_report WHERE report_date = ? ORDER BY part, category, title`
        ).bind(selectedDate).all()
      : env.DB.prepare(
          `SELECT * FROM tech_daily_report WHERE report_date = ? AND part = ? ORDER BY category, title`
        ).bind(selectedDate, selectedPart).all();

  // 정체 항목(활성 상태인데 STALE_THRESHOLD_DAYS일 넘게 업데이트가 없는 항목)은 선택한
  // 날짜와 무관하게 "지금" 기준으로 계산하되 선택한 파트에 맞춰 표시한다.
  const openItemsQuery = env.DB.prepare(
    `SELECT i.id, i.part, i.category, i.title, i.owner,
        (SELECT MAX(u.report_date) FROM tech_daily_update u WHERE u.item_id = i.id) AS latest_date
       FROM tech_daily_item i WHERE i.closed_at IS NULL`
  ).all();

  const [reports, liveUpdates, openItems] = await Promise.all([
    reportsQuery,
    loadLiveUpdatesForDate(selectedDate),
    openItemsQuery,
  ]);

  const actions = dailyAttentionItems(liveUpdates);

  const dateOptions = dates.map((d) =>
    `<option value="${escapeHtml(d)}" ${d === selectedDate ? "selected" : ""}>${escapeHtml(d)}</option>`
  ).join("");

  const todayStr = businessDateString();
  const scopedOpenItems = openItems.results.filter((item) => selectedPart === "all" || item.part === selectedPart);
  const reportTextTranslations = await buildDisplayTranslationMap(env, [
    ...liveUpdates.map((update) => update.title),
    ...scopedOpenItems.map((item) => item.title),
    ...reports.results.flatMap((report) => [
      report.category,
      report.title,
      report.content,
      report.progress_note,
      report.status,
      report.remark,
    ]),
  ], lang);
  const todayMs = new Date(todayStr).getTime();
  const staleItems = scopedOpenItems.filter((it) => {
    if (!it.latest_date) return true;
    const days = Math.floor((todayMs - new Date(it.latest_date).getTime()) / 86400000);
    return days >= STALE_THRESHOLD_DAYS;
  });
  const reportedIds = new Set(liveUpdates.map((update) => Number(update.item_id)));
  const unreportedItems = selectedDate
    ? scopedOpenItems.filter((item) => !reportedIds.has(Number(item.id)))
    : [];
  const detailCell = (text) => text
    ? `<details><summary>${escapeHtml(L.viewDetail)}</summary><pre style="white-space:pre-wrap;font-family:inherit;margin:6px 0 0;">${escapeHtml(text)}</pre></details>`
    : "-";

  // 과거 아카이브와 신규 입력 둘 다 part 로 그룹핑해서, 파트마다 "제목/상태/담당자"
  // 한눈에 보는 요약표 + 상세 카드/표를 이어붙인다 — 작성자마다 필드 구성이 달라도
  // 항상 같은 모양으로 보이게 해서 임원 보고용으로 그대로 쓸 수 있게 하는 게 목적.
  const renderPartSection = (part) => {
    const live = liveUpdates.filter((u) => u.part === part);
    const archive = reports.results.filter((r) => r.part === part);
    if (!live.length && !archive.length) return "";

    const overview = live.map((u) => {
      const fields = getUpdateFieldMap(u);
      const raw = getUpdateRawFieldMap(u);
      const status = firstDailyValue(fields, "상태") || u.statusValue || "-";
      const rawStatus = firstDailyValue(raw, "상태") || u.rawStatusValue || status;
      const work = firstDailyValue(fields, "작업내용");
      const issue = firstDailyValue(fields, "이슈/조치내용", "이슈 및 조치내용");
      const remark = firstDailyValue(fields, "비고");
      const statusClass = isIssueStatus(rawStatus) ? "issue" : isDoneStatus(rawStatus) ? "done" : "";
      return `<article class="daily-overview${statusClass ? ` is-${statusClass}` : ""} no-print">
        <div class="daily-overview-head"><div class="daily-overview-title"><div class="muted">${escapeHtml(resolveOptionValue(u.category || "-", lang, reportTextTranslations))}${fields["제품"] ? ` · ${escapeHtml(fields["제품"])}` : ""}</div>
        <h4><a href="/daily-items/${u.item_id}">${escapeHtml(translatedText(u.title, reportTextTranslations))}</a></h4></div>
        <div class="daily-overview-meta"><span class="status-pill ${statusClass}">${escapeHtml(status)}</span>
        <span class="muted">${escapeHtml(L.colAssignee)} · ${escapeHtml(u.owner || "-")}</span></div></div>
        ${work ? `<p class="daily-content">${escapeHtml(work)}</p>` : ""}
        ${issue ? `<p class="daily-content daily-issue"><strong>${escapeHtml(L.colIssueAction)}</strong> · ${escapeHtml(issue)}</p>` : ""}
        ${remark ? `<p class="daily-content muted"><strong>${escapeHtml(L.colRemark)}</strong> · ${escapeHtml(remark)}</p>` : ""}
        <details class="daily-field-details"><summary>${escapeHtml(U.details)}</summary><dl>${(u.fieldValues || []).map(f => `<div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`).join("")}</dl></details>
      </article>`;
    }).join("");

    const summaryRows = live.map((u) => {
      const fields = getUpdateFieldMap(u);
      const rawFields = getUpdateRawFieldMap(u);
      const status = firstDailyValue(fields, "상태") || u.statusValue || "-";
      const rawStatus = firstDailyValue(rawFields, "상태") || u.rawStatusValue || status;
      const progress = firstDailyValue(fields, "진행률");
      const issueAction = firstDailyValue(fields, "이슈/조치내용", "이슈 및 조치내용");
      const quantities = dailyGoodDefectValues(fields);
      const statusClass = isIssueStatus(rawStatus) ? "issue" : isDoneStatus(rawStatus) ? "done" : "";
      return `
      <tr>
        <td data-label="${escapeHtml(L.colCategory)}">${escapeHtml(resolveOptionValue(u.category || firstDailyValue(fields, "업무구분") || "-", lang, reportTextTranslations))}</td>
        <td data-label="${escapeHtml(L.colProduct)}">${escapeHtml(firstDailyValue(fields, "제품") || "-")}</td>
        <td data-label="${escapeHtml(L.colTitle)}"><a href="/daily-items/${u.item_id}">${escapeHtml(translatedText(u.title, reportTextTranslations))}</a></td>
        <td data-label="${escapeHtml(L.colProcess)}">${escapeHtml(firstDailyValue(fields, "진행중인 공정") || "-")}</td>
        <td data-label="${escapeHtml(L.colPartNumber)}">${escapeHtml(firstDailyValue(fields, "파트넘버") || "-")}</td>
        <td data-label="${escapeHtml(L.colLotNumber)}">${escapeHtml(firstDailyValue(fields, "랏넘버") || "-")}</td>
        <td data-label="${escapeHtml(L.colQuantity)}">${escapeHtml(firstDailyValue(fields, "수량") || "-")}</td>
        <td data-label="${escapeHtml(L.colGoodQuantity)}">${escapeHtml(quantities.good || "-")}</td>
        <td data-label="${escapeHtml(L.colDefectQuantity)}">${escapeHtml(quantities.defect || "-")}</td>
        <td data-label="${escapeHtml(L.colYield)}">${escapeHtml(firstDailyValue(fields, "수율") || "-")}</td>
        <td data-label="${escapeHtml(L.colStatus)}"><span class="status-pill ${statusClass}">${escapeHtml(status)}</span>${progress ? `<div class="muted">${escapeHtml(progress)}</div>` : ""}</td>
        <td data-label="${escapeHtml(L.colIssueAction)}">${detailCell(issueAction || firstDailyValue(fields, "비고"))}</td>
        <td data-label="${escapeHtml(L.colAssignee)}">${escapeHtml(u.owner || "-")}</td>
      </tr>`;
    }).join("");

    const archiveRows = archive.map((r) => `
      <tr>
        <td data-label="${escapeHtml(L.colCategory)}">${escapeHtml(translatedText(r.category, reportTextTranslations) || "-")}</td>
        <td data-label="${escapeHtml(L.colTitle)}">${escapeHtml(translatedText(r.title, reportTextTranslations) || "-")}</td>
        <td data-label="${escapeHtml(L.colContent)}">${detailCell(translatedText(r.content, reportTextTranslations))}</td>
        <td data-label="${escapeHtml(L.colProgress)}">${detailCell(translatedText(r.progress_note, reportTextTranslations))}</td>
        <td data-label="${escapeHtml(L.colStatus)}">${escapeHtml(translatedText(r.status, reportTextTranslations) || "-")}</td>
        <td data-label="${escapeHtml(L.colAssignee)}">${escapeHtml(r.owner || "-")}</td>
        <td data-label="${escapeHtml(L.colRemark)}">${escapeHtml(translatedText(r.remark, reportTextTranslations) || "-")}</td>
      </tr>`).join("");

    return `
    <div class="card daily-part">
      <div class="daily-part-head"><h3>${escapeHtml(part)}</h3><span class="daily-count">${live.length + archive.length}</span></div>
      ${live.length ? `
      ${overview}
      <details class="daily-technical"><summary class="no-print">${escapeHtml(U.technical)}</summary>
      <div class="report-table-wrap" style="margin-bottom:14px;">
        <table class="report-table live-report-table">
          <thead><tr>
            <th>${escapeHtml(L.colCategory)}</th><th>${escapeHtml(L.colProduct)}</th><th>${escapeHtml(L.colTitle)}</th>
            <th>${escapeHtml(L.colProcess)}</th><th>${escapeHtml(L.colPartNumber)}</th><th>${escapeHtml(L.colLotNumber)}</th>
            <th>${escapeHtml(L.colQuantity)}</th><th>${escapeHtml(L.colGoodQuantity)}</th><th>${escapeHtml(L.colDefectQuantity)}</th>
            <th>${escapeHtml(L.colYield)}</th><th>${escapeHtml(L.colStatus)}</th><th>${escapeHtml(L.colIssueAction)}</th><th>${escapeHtml(L.colAssignee)}</th>
          </tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div></details>` : ""}
      ${archive.length ? `
      <div class="report-table-wrap" style="margin-top:${live.length ? "14px" : "0"};">
        <table class="report-table archive-report-table">
          <thead><tr>
            <th>${escapeHtml(L.colCategory)}</th><th>${escapeHtml(L.colTitle)}</th><th>${escapeHtml(L.colContent)}</th>
            <th>${escapeHtml(L.colProgress)}</th><th>${escapeHtml(L.colStatus)}</th><th>${escapeHtml(L.colAssignee)}</th><th>${escapeHtml(L.colRemark)}</th>
          </tr></thead>
          <tbody>${archiveRows}</tbody>
        </table>
      </div>` : ""}
    </div>`;
  };

  const partsToShow = selectedPart === "all" ? ["SSD", "Module"] : [selectedPart];
  const sections = partsToShow.map(renderPartSection).join("");
  const totalCount = reports.results.length + liveUpdates.length;
  const actionRows = actions.map((action) => `
    <tr>
      <td>${escapeHtml(action.part)}</td>
      <td><a href="/daily-items/${action.item_id}">${escapeHtml(translatedText(action.title, reportTextTranslations))}</a></td>
      <td><span class="status-pill issue">${escapeHtml(action.status || "-")}</span></td>
      <td>${escapeHtml(action.issueAction || "-").replace(/\n/g, "<br>")}</td>
      <td>${escapeHtml(action.owner || "-")}</td>
    </tr>`).join("");
  const unreportedRows = unreportedItems.map((item) => `
    <tr>
      <td>${escapeHtml(item.part)}</td><td>${escapeHtml(resolveOptionValue(item.category || "-", lang, reportTextTranslations))}</td>
      <td><a href="/daily-items/${item.id}">${escapeHtml(translatedText(item.title, reportTextTranslations))}</a></td><td>${escapeHtml(item.owner || "-")}</td>
      <td>${escapeHtml(item.latest_date || "-")}</td>
    </tr>`).join("");

  return html(layout({
    title: L.dailyReportsHeading, user, lang, activeNav: "daily", mainClass: "daily-work-page", body: `
    ${dailyWorkSubtabs(L, "report", user)}
    <header class="daily-heading">
      <div><h2>${escapeHtml(L.dailyReportsHeading)}</h2><p class="muted no-print">${escapeHtml(U.intro)}</p></div>
      <a class="daily-primary no-print" href="/daily-items">${escapeHtml(U.write)}</a>
    </header>
    <div class="card daily-toolbar no-print">
      <form method="get" action="/daily-reports" class="daily-filter">
        <div>
          <label>${escapeHtml(L.filterDate)}</label>
          <select name="date" aria-label="${escapeHtml(L.filterDate)}" ${dates.length ? "" : "disabled"}>${dateOptions || `<option value="">${escapeHtml(U.empty)}</option>`}</select>
        </div>
        <div>
          <label>${escapeHtml(L.filterPart)}</label>
          <select name="part">
            <option value="all" ${selectedPart === "all" ? "selected" : ""}>${escapeHtml(L.filterPartAll)}</option>
            <option value="SSD" ${selectedPart === "SSD" ? "selected" : ""}>SSD</option>
            <option value="Module" ${selectedPart === "Module" ? "selected" : ""}>Module</option>
          </select>
        </div>
        <div><button type="submit">${escapeHtml(L.filterApply)}</button></div>
      </form>
    </div>
    <div class="daily-resultbar">
      <p class="muted">${escapeHtml(selectedDate || "")} · ${totalCount} ${escapeHtml(U.count)} ${actions.length ? ` · <a class="no-print" href="#daily-attention">${escapeHtml(L.actionRequired)} (${actions.length})</a>` : ""}</p>
      <button type="button" class="secondary no-print" onclick="window.print()">${escapeHtml(L.printBtn)}</button>
    </div>
    ${sections || `<div class="card daily-empty"><h3>${escapeHtml(U.empty)}</h3><p class="muted">${escapeHtml(U.emptyHelp)}</p><a class="daily-primary" href="/daily-items">${escapeHtml(U.write)}</a></div>`}
    <details id="daily-attention" class="card daily-followup no-print" ${actions.length ? "open" : ""}>
      <summary>${escapeHtml(L.actionRequired)} (${actions.length})</summary>
      ${actions.length ? `<div style="overflow-x:auto;"><table>
        <thead><tr><th>${escapeHtml(L.colPart)}</th><th>${escapeHtml(L.colTitle)}</th><th>${escapeHtml(L.colStatus)}</th><th>${escapeHtml(L.colIssueAction)}</th><th>${escapeHtml(L.colAssignee)}</th></tr></thead>
        <tbody>${actionRows}</tbody></table></div>` : `<p>${escapeHtml(L.noActionRequired)}</p>`}
    </details>
    ${unreportedItems.length ? `<details class="card daily-followup no-print">
      <summary>${escapeHtml(L.unreportedItems)} (${unreportedItems.length})</summary>
      <p class="muted">${escapeHtml(L.unreportedNotice)}</p>
      <div style="overflow-x:auto;"><table>
        <thead><tr><th>${escapeHtml(L.colPart)}</th><th>${escapeHtml(L.colCategory)}</th><th>${escapeHtml(L.colTitle)}</th><th>${escapeHtml(L.colAssignee)}</th><th>${escapeHtml(L.colLastUpdate)}</th></tr></thead>
        <tbody>${unreportedRows}</tbody></table></div>
    </details>` : ""}
    ${staleItems.length ? `
    <details class="card daily-followup no-print">
      <summary>${escapeHtml(L.statStaleItemsTemplate.replace("{n}", STALE_THRESHOLD_DAYS))} (${staleItems.length}) · ${escapeHtml(U.current)}</summary>
      <div style="margin-top:8px;">
        ${staleItems.map((it) => `<div><a href="/daily-items/${it.id}">${escapeHtml(it.part)} · ${escapeHtml(translatedText(it.title, reportTextTranslations))}</a> <span class="muted">— ${it.latest_date ? escapeHtml(L.staleSinceTemplate.replace("{date}", it.latest_date)) : escapeHtml(L.staleNeverUpdated)}</span></div>`).join("")}
      </div>
    </details>` : ""}
` }));
}