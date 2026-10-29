import {
  COMMON_SECURITY_HEADERS, HTML_SECURITY_HEADERS,
  SIGNUP_EMAIL_DOMAIN,
  json, html, plainText, redirect,
  isSameOriginMutation, isValidIsoDate, businessDateString, addDays,
  escapeHtml, bytesToBase64, base64ToBytes, randomBytes, randomToken,
  pbkdf2, hashPassword, verifyPassword,
  parseCookies, sessionCookie, clearedSessionCookie,
  isAllowedSignupEmail,
} from "./src/utils/helpers.js";
import { langSwitcher, layout, dailyWorkSubtabs, pageMenuPlaceholder, forbiddenResponse } from "./src/views/layout.js";
import {
  pageUserApprovals,
  handleMemberAccount,
  handleUserApprove,
  handleUserPasswordReset,
  handleUserPromote,
  handleUserDemote,
  handleUserRevoke,
} from "./src/routes/users.js";

import {
  getCurrentUser,
  requireAuth,
  sendAppEmail,
  sendResetEmail,
  sendVerificationEmail,
  pageLogin,
  handleLoginPost,
  handleLogout,
  handleLangSwitch,
  pageSignup,
  handleSignupPost,
  handleVerifyEmail,
  pageResendVerification,
  handleResendVerificationPost,
  pageForgotPassword,
  handleForgotPasswordPost,
  pageResetPassword,
  handleResetPasswordPost,
  pageSetup,
  handleSetupPost,
  handleChangePassword,
} from "./src/routes/auth.js";
import { RETIRED_DAILY_FIELDS, lotWords, normalizeLotIds, lotInput, lotScript, handleLotInfoApi } from "./lot-info.js";
import { handleLotTracker } from "./lot-tracker.js";
import {
  normalizeDailyStatusCode,
  resolveStandardOptionValue,
  detectTextLanguage,
  translateText,
  resolveTrilingualText,
  buildDisplayTranslationMap,
  warmTranslationCache,
  translatedText,
  mapWithConcurrency,
} from "./src/modules/translation/translation-service.js";

import appPackage from "./package.json" with { type: "json" };
import { handleEvaluationApi } from "./evaluation/generated/server.js";
import { clientJs, clientCss, reportTemplate } from "./evaluation/generated/assets.js";
import { FIELD_HEADERS, fieldCsv, parseFieldCsv } from "./daily-field-csv.js";
import {
  DAILY_CLASSIFICATION_FIELDS,
  DAILY_CLASSIFICATION_ROWS,
  DAILY_WORK_STATUS_DEFINITIONS,
  classificationOptions,
  isValidClassification,
} from "./daily-report-config.js";
import {
  LANGS,
  DEFAULT_LANG,
  LANG_NAMES,
  I18N,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  WORK_CATEGORIES,
  STANDARD_OPTION_LABELS,
  DAILY_STATUS_LABELS,
  LEGACY_DAILY_STATUS_CODES,
  getLang,
  t,
  langCookie,
  registerFeatureTranslations,
} from "./i18n.js";

/**
 * YieldOps 제품기술 업무관리 (workmanager) — 단일 파일 Cloudflare Worker
 * 프레임워크/빌드 없음.
 *
 * 필요한 바인딩/시크릿 (Settings에서 등록):
 *  - D1 바인딩: 변수명 DB
 *  - Secret: SETUP_TOKEN  (최초 관리자 계정 생성 시 1회만 사용, 이후 삭제 권장)
 *  - Secret: RESEND_API_KEY  (비밀번호 찾기 이메일 발송, https://resend.com)
 *  - Var(선택): RESET_EMAIL_FROM  (발신 이메일 주소, 미설정 시 기본값 사용)
 *
 * 라우트:
 *  GET  /            일일업무보고 조회로 이동 (로그인 필요)
 *  GET  /tasks       평가업무 관리 대시보드
 *  GET  /login        로그인 폼
 *  POST /login        로그인 처리
 *  POST /logout        로그아웃
 *  GET  /signup        회원가입 폼 (@hanyangdgtvina.com 이메일만 가입 가능)
 *  POST /signup        회원가입 처리 (role=member) — RESEND_API_KEY 설정 시 이메일 인증 필요, 미설정 시 즉시 활성화
 *  GET  /verify-email      이메일 인증 링크 처리 (토큰 필요)
 *  GET  /resend-verification 인증 메일 재전송 폼
 *  POST /resend-verification 인증 메일 재전송 처리
 *  GET  /forgot-password   비밀번호 찾기 폼 (이메일 입력)
 *  POST /forgot-password   재설정 링크 이메일 발송
 *  GET  /reset-password    새 비밀번호 설정 폼 (토큰 필요)
 *  POST /reset-password    새 비밀번호 저장
 *  GET  /setup         최초 관리자 생성 폼 (계정이 하나도 없을 때만, SETUP_TOKEN 필요)
 *  POST /setup         최초 관리자 생성 처리
 *  GET  /lang/:code      화면 언어 전환 (ko|en|vi), 이전 페이지로 리다이렉트
 *  GET  /api/tasks       업무 목록 (JSON)
 *  POST /api/tasks       업무 생성
 *  POST /api/tasks/:id     업무 수정 (상태/담당자/기한 등)
 *  GET  /api/tasks/:id/updates 업무별 진행현황 목록
 *  POST /api/tasks/:id/updates 업무별 진행현황 추가
 *  GET  /api/reports       보고 이력 목록
 *  POST /api/reports       보고 이력 추가
 *  GET  /daily-reports     SSD/Module 일일업무보고 조회 (과거 아카이브 + 신규 입력, 날짜/파트 필터)
 *  GET  /daily-items      SSD/Module 업무 항목 목록 + 새 항목 등록 폼
 *  GET  /full-analysis-reports 전수분석 현황보고
 *  GET  /master-data-status 기준정보 관리현황
 *  GET  /admin/users      (관리자) 전체 사용자 목록 + 승인/권한/접근 관리
 *  POST /admin/users/:id/approve (관리자) 회원 수동 승인
 *  POST /admin/users/:id/promote (관리자) 일반 회원 -> 관리자로 전환
 *  POST /admin/users/:id/demote (관리자) 관리자 -> 일반 회원으로 전환
 *  POST /admin/users/:id/revoke (관리자) 계정 접근 차단 (승인 취소 + 세션 폐기)
 *  GET/POST /admin/users/:id/edit (관리자) 일반 계정 이름/이메일 수정
 *  GET/POST /admin/users/:id/delete (관리자) 일반 계정 삭제 확인/처리 (업무 이력 보존)
 *  POST /daily-items/new    새 항목 등록
 *  GET  /daily-items/:id    항목 상세 + 업데이트 이력 + 업데이트 등록 폼
 *  POST /daily-items/:id/updates 항목에 날짜별 진행 업데이트 추가
 *  POST /daily-items/:id/close  항목 종료/재오픈 토글
 *  GET  /daily-fields      (관리자) 일일보고 입력항목 설정 목록 + 새 항목 추가 폼
 *  POST /daily-fields/apply-standard 엑셀 기준 표준 설정 적용 + 기존 보고 이력 초기화
 *  GET  /api/product-match 파트넘버의 SSD/Module 제품 마스터 일치 정보 조회
 *  POST /daily-fields/new    입력항목 추가
 *  GET  /daily-fields/:id    입력항목 수정 폼 + 선택지 관리 (select 타입)
 *  POST /daily-fields/:id    입력항목 이름/타입 수정
 *  POST /daily-fields/:id/delete 미사용 입력항목 삭제 (과거 입력값이 있으면 거부)
 *  POST /daily-fields/:id/move  입력항목 순서를 한 칸 위/아래로 이동 (일일보고 입력 폼에 그대로 반영됨)
 *  POST /daily-fields/:id/options/new 선택지 추가
 *  POST /daily-fields/:id/options/:optionId/delete 선택지 삭제
 *  POST /daily-fields/:id/options/import CSV 파일 업로드/붙여넣기로 선택지 일괄 추가 (중복 값은 자동 skip)
 */

const STALE_THRESHOLD_DAYS = 3;

// ---------- 다국어 (한국어/영어/베트남어) ----------
// 화면에 표시되는 문구만 언어별로 분리. DB에 저장되는 status/priority 값(검토중/조치중/완료/보류, 상/중/하)은
// 항상 한국어 원본을 그대로 사용하고(스키마 CHECK 제약과 CSS 클래스명이 이 값에 의존함), 화면에 보여줄 때만 번역함.

const DAILY_CLASSIFICATION_VALUES = new Set(DAILY_CLASSIFICATION_ROWS.flat().filter(Boolean));

// #region 일일업무 도메인 로직 — 상태 코드 정규화 · 확인 필요 항목


function getUpdateFieldMap(update) {
  return Object.fromEntries((update.fieldValues || []).map((field) => [field.key || field.label, field.value]));
}

function getUpdateRawFieldMap(update) {
  return Object.fromEntries((update.fieldValues || []).map((field) => [field.key || field.label, field.rawValue ?? field.value]));
}

function firstDailyValue(map, ...keys) {
  for (const key of keys) {
    if (map[key] !== undefined && map[key] !== null && String(map[key]).trim() !== "") return map[key];
  }
  return "";
}

function dailyGoodDefectValues(fields) {
  let good = firstDailyValue(fields, "양품 수량", "양품");
  let defect = firstDailyValue(fields, "불량 수량", "불량");
  const combined = firstDailyValue(fields, "양품/불량 수량", "양품·불량 수량");
  if ((!good || !defect) && combined) {
    const parts = String(combined).split(/\s*[\/|:]\s*/, 2);
    if (!good && parts[0]) good = parts[0];
    if (!defect && parts[1]) defect = parts[1];
  }
  return { good, defect };
}

function isIssueStatus(status) {
  return ["DELAYED", "RESTRICTED", "ISSUE", "REWORK", "ON_HOLD"].includes(normalizeDailyStatusCode(status));
}

function isDoneStatus(status) {
  return normalizeDailyStatusCode(status) === "COMPLETED";
}

function dailyAttentionItems(updates) {
  const actions = [];

  for (const update of updates) {
    const fields = getUpdateFieldMap(update);
    const rawFields = getUpdateRawFieldMap(update);
    const rawStatus = firstDailyValue(rawFields, "상태") || update.rawStatusValue || "";
    const status = firstDailyValue(fields, "상태") || update.statusValue || rawStatus;
    const category = update.category || firstDailyValue(rawFields, "업무구분") || "";
    const explicitIssueAction = firstDailyValue(fields, "이슈/조치내용", "이슈 및 조치내용");
    const issueAction = explicitIssueAction || (/이슈대응|불량분석/.test(category) ? firstDailyValue(fields, "비고") : "");
    if (isIssueStatus(rawStatus) || issueAction) {
      actions.push({ ...update, status, rawStatus, issueAction, fields });
    }
  }
  return actions;
}

// ---------- 유틸 ----------

// #endregion

// #region HTTP 응답 & 보안 유틸 — json/html, CSRF 체크, 날짜 검증

function evaluationAsset(request) {
  const url = new URL(request.url);
  const headers = { ...COMMON_SECURITY_HEADERS };
  if (url.pathname === "/evaluation/client.js") return new Response(clientJs, { headers: { ...headers, "content-type": "text/javascript; charset=utf-8" } });
  if (url.pathname === "/evaluation/client.css") return new Response(clientCss, { headers: { ...headers, "content-type": "text/css; charset=utf-8" } });
  if (url.pathname === "/evaluation/template.xlsx") {
    const bytes = Uint8Array.from(atob(reportTemplate), c => c.charCodeAt(0));
    return new Response(bytes, { headers: { ...headers, "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="evaluation-report-template.xlsx"' } });
  }
  if (url.pathname !== "/evaluation/app") return plainText("Not found",404);
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>평가업무 관리</title><link rel="stylesheet" href="/evaluation/client.css"></head><body><div id="evaluation-root"></div><script type="module" src="/evaluation/client.js"></script></body></html>`, {
    headers: { ...headers, "x-frame-options": "SAMEORIGIN", "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'" },
  });
}

function pageEvaluation(request,user) {
  const lang=getLang(request), requested=new URL(request.url).searchParams.get("section") || "overview";
  const sections=["overview","list","new-product","mass-report","history","reports",...(user.role === "admin" ? ["users"] : [])];
  const section=sections.includes(requested) ? requested : "overview";
  // The frame fills the space under the fixed header so only the evaluation document scrolls.
  // While a Q-EVAL dialog is open the frame covers the whole window; dialogs are wider than the
  // area beside the sidebar and would otherwise be clipped.
  return html(layout({title:t(lang).navTasks,user,lang,activeNav:"tasks",activeSubNav:section,mainClass:"evaluation-main",body:`
    <style>main.evaluation-main{padding:12px 16px}.evaluation-frame{display:block;width:100%;height:calc(100vh - var(--header-h) - 24px);min-height:480px;border:0;border-radius:8px;background:var(--bg)}.evaluation-frame.is-dialog{position:fixed;inset:0;width:100vw;height:100vh;min-height:0;border-radius:0;z-index:100}@media(max-width:680px){main.evaluation-main{padding:8px}.evaluation-frame{height:calc(100vh - 16px)}}</style>
    <iframe class="evaluation-frame" title="${escapeHtml(t(lang).navTasks)}" src="/evaluation/app?section=${section}&amp;lang=${lang}"></iframe>
    <script>
      (function () {
        var frame = document.querySelector(".evaluation-frame");
        window.addEventListener("message", function (event) {
          if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data || event.data.type !== "qeval:dialog") return;
          frame.classList.toggle("is-dialog", Boolean(event.data.open));
        });
      })();
    </script>`}));
}


// #endregion

// #region 평가업무 대시보드 (/tasks 목록)

async function pageDashboard(request, env, user) {
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

// #endregion

// #region 일일업무 보고 조회 (/daily-reports)

function dailyUi(lang) {
  return {
    ko: { intro: "날짜와 파트를 선택하고, 업무별 진행 상황을 확인하세요.", write: "보고 작성", technical: "공정 · 수량 등 전체 항목 보기", empty: "아직 등록된 보고가 없습니다", emptyHelp: "업무 항목을 선택하거나 새로 등록하여 첫 보고를 작성하세요.", inputHelp: "기존 업무를 선택해 오늘의 보고를 작성하세요. 처음 진행하는 업무만 새 항목으로 등록합니다.", allItems: "종료 항목 포함", current: "현재 기준", count: "건", details: "입력한 내용 모두 보기" },
    en: { intro: "Choose a date and team to review each task’s progress.", write: "Write report", technical: "View all process and quantity columns", empty: "No reports yet", emptyHelp: "Choose an existing task or create one to write your first report.", inputHelp: "Select an existing task to add today’s report. Create a new task only for new work.", allItems: "Include closed tasks", current: "As of today", count: "reports", details: "View all entered details" },
    vi: { intro: "Chọn ngày và bộ phận để xem tiến độ từng công việc.", write: "Viết báo cáo", technical: "Xem tất cả công đoạn và số lượng", empty: "Chưa có báo cáo", emptyHelp: "Chọn công việc có sẵn hoặc tạo mới để viết báo cáo đầu tiên.", inputHelp: "Chọn công việc có sẵn để báo cáo hôm nay. Chỉ tạo mục mới cho công việc mới.", allItems: "Bao gồm công việc đã đóng", current: "Tính đến hôm nay", count: "báo cáo", details: "Xem tất cả nội dung đã nhập" },
  }[lang];
}

async function pageDailyReports(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  const U = dailyUi(lang);
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

// #endregion

// #region 일일업무 입력 항목 (/daily-items)

async function pageDailyItems(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  const U = dailyUi(lang);
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

async function handleDailyItemCreate(request, env, user) {
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



// 필드 이름은 관리자가 그때그때 자유롭게 짓는 텍스트라 I18N 객체로는 다국어 처리를 할 수
// 없다. label_en/label_vi 가 채워져 있으면 그걸 쓰고, 없으면 항상 필수인 label(한국어)로
// 대체한다 — 그래야 번역을 아직 안 채운 필드도 화면에 빈 값 대신 뭔가는 보인다.
// #endregion

// #region 동적 필드 값 처리 & 자동 번역 (EAV, Workers AI)

function resolveFieldLabel(field, lang, translationMap = new Map()) {
  if (lang === "en" && field.label_en) return field.label_en;
  if (lang === "vi" && field.label_vi) return field.label_vi;
  return translatedText(field.label, translationMap) || field.label;
}

// tech_daily_update_value 한 행(value/value_en/value_vi)을 뷰어의 화면 언어에 맞는
// 텍스트로 바꾼다 — resolveFieldLabel과 완전히 같은 패턴(번역이 없으면 원문 폴백).
function resolveValueText(row, lang, translationMap = new Map()) {
  if (lang === "en" && row.value_en) return row.value_en;
  if (lang === "vi" && row.value_vi) return row.value_vi;
  return translatedText(row.value, translationMap) || row.value;
}

const IDENTIFIER_DAILY_FIELDS = new Set(["LOTID", "랏넘버", "파트넘버"]);
const isIdentifierField = (field) => IDENTIFIER_DAILY_FIELDS.has(field?.label);

function resolveOptionValue(value, lang, translationMap = new Map(), isStatus = false) {
  const code = isStatus ? normalizeDailyStatusCode(value) : null;
  if (!isStatus && lang === "ko" && DAILY_CLASSIFICATION_VALUES.has(value)) return value;
  const standard = code
    ? (DAILY_STATUS_LABELS[code]?.[lang] || DAILY_STATUS_LABELS[code]?.ko || value)
    : (STANDARD_OPTION_LABELS[value]?.[lang] || value);
  return standard !== value ? standard : (translatedText(value, translationMap) || value);
}

// updates: tech_daily_update 행 배열(각 .id 필요). 각 행에 .fieldValues(뷰어 언어로 이미
// 번역된 {label,value} 목록)와, 라벨이 정확히 '상태'인 필드가 있으면 그 값을 담은
// .statusValue를 붙여서 돌려준다(요약 테이블 등에서 상태만 뽑아 쓰기 위함).
async function attachFieldValues(env, lang, updates) {
  if (!updates.length) return updates;
  const { fields } = await loadDailyFields(env, true);
  const fieldById = Object.fromEntries(fields.map((f) => [f.id, f]));
  const statusField = fields.find((f) => f.label === "상태");
  const values = await env.DB.prepare(
    `SELECT * FROM tech_daily_update_value WHERE update_id IN (${updates.map(() => "?").join(",")})`
  ).bind(...updates.map((u) => u.id)).all();
  const valuesByUpdate = {};
  for (const v of values.results) {
    (valuesByUpdate[v.update_id] ||= {})[v.field_id] = v;
  }
  const fieldLabelTranslations = await buildDisplayTranslationMap(
    env,
    fields.filter((field) => !((lang === "en" && field.label_en) || (lang === "vi" && field.label_vi))).map((field) => field.label),
    lang
  );
  const missingValues = values.results.filter((row) => {
    const field = fieldById[row.field_id];
    if (isIdentifierField(field)) return false;
    return field?.input_type === "select"
      || (lang === "en" && !row.value_en)
      || (lang === "vi" && !row.value_vi);
  }).map((row) => row.value);
  const valueTranslations = await buildDisplayTranslationMap(env, missingValues, lang);
  const displayValue = (row) => {
    const field = fieldById[row.field_id];
    if (isIdentifierField(field)) return row.value;
    return field?.input_type === "select"
      ? resolveOptionValue(row.value, lang, valueTranslations, field?.label === "상태")
      : resolveValueText(row, lang, valueTranslations);
  };
  return updates.map((u) => {
    const raw = valuesByUpdate[u.id] || {};
    return {
      ...u,
      rawStatusValue: statusField && raw[statusField.id] ? raw[statusField.id].value : null,
      statusValue: statusField && raw[statusField.id] ? displayValue(raw[statusField.id]) : null,
      fieldValues: Object.entries(raw)
        .map(([fieldId, row]) => ({
          fieldId,
          key: fieldById[fieldId] ? fieldById[fieldId].label : "-",
          label: fieldById[fieldId] ? resolveFieldLabel(fieldById[fieldId], lang, fieldLabelTranslations) : "-",
          rawValue: row.value,
          value: displayValue(row),
        }))
        .filter((fv) => fv.value),
    };
  });
}


// tech_daily_field 목록과, select 타입 필드의 선택지를 함께 읽어온다.
// fields: sort_order 순 필드 목록(각 field.options 포함). optionValueById: 선택지 id -> 값
// 텍스트 조회용(캐스케이딩 드롭다운에서 "상위 선택지 id"를 상위 select 의 실제 표시값으로
// 바꿔서 브라우저 쪽 필터링 스크립트에 넘기기 위해 필요함).
async function loadDailyFields(env, includeRetired = false) {
  const fields = await env.DB.prepare(`SELECT * FROM tech_daily_field ORDER BY sort_order, id`).all();
  const options = await env.DB.prepare(`SELECT * FROM tech_daily_field_option ORDER BY field_id, sort_order, id`).all();
  const optionsByField = {};
  const optionValueById = {};
  for (const o of options.results) {
    (optionsByField[o.field_id] ||= []).push(o);
    optionValueById[o.id] = o.value;
  }
  return { fields: (includeRetired ? fields.results : activeDailyFields(fields.results)).map((f) => ({ ...f, options: optionsByField[f.id] || [] })), optionValueById };
}

function activeDailyFields(fields) {
  return hasDailyClassification(fields) ? fields.filter(f => !RETIRED_DAILY_FIELDS.has(f.label)) : fields;
}

function hasDailyClassification(fields) {
  return DAILY_CLASSIFICATION_FIELDS.every((label) => fields.some((field) => field.label === label));
}

// 필드가 depends_on_field_id 를 가지면(=캐스케이딩 드롭다운) 각 <option> 에 상위 선택지의
// 실제 값을 data-parent 로 심어두고, <select> 자체에는 어느 상위 필드를 지켜봐야 하는지
// data-depends-on 으로 표시해둔다. 실제 필터링은 pageDailyItemDetail 에 심어둔 공용 스크립트가 처리.
function renderFieldInput(field, L, value = "", optionValueById = {}, lang = DEFAULT_LANG, translationMap = new Map()) {
  const name = `field_${field.id}`;
  if (field.label === "LOTID") return lotInput(field, value, lang, escapeHtml);
  if (field.input_type === "textarea") {
    if (field.label === "파트넘버") {
      return `<textarea name="${name}" data-product-info aria-describedby="product-match-${field.id}" placeholder="Part number를 한 줄에 하나씩 입력">${escapeHtml(value)}</textarea>
        <div id="product-match-${field.id}" class="muted" data-product-match aria-live="polite"></div>`;
    }
    return `<textarea name="${name}">${escapeHtml(value)}</textarea>`;
  }
  if (field.input_type === "select") {
    const classificationLevel = DAILY_CLASSIFICATION_FIELDS.indexOf(field.label);
    // Standard classifications use the complete workbook path, not the generic
    // parent-value filter. CSV imports may contain the same value on many paths.
    const dependsAttr = classificationLevel < 0 && field.depends_on_field_id ? ` data-depends-on="field_${field.depends_on_field_id}"` : "";
    const classificationAttr = classificationLevel >= 0
      ? ` data-classification-level="${classificationLevel}"${classificationLevel < 4 ? " required" : ""}`
      : "";
    const choices = classificationLevel >= 0 ? [...new Map(field.options.map((option) => [option.value, option])).values()] : field.options;
    const opts = choices.map((o) => {
      const parentAttr = classificationLevel < 0 && o.parent_option_id ? ` data-parent="${escapeHtml(optionValueById[o.parent_option_id] || "")}"` : "";
      return `<option value="${escapeHtml(o.value)}"${parentAttr} ${o.value === value ? "selected" : ""}>${escapeHtml(resolveOptionValue(o.value, lang, translationMap, field.label === "상태"))}</option>`;
    }).join("");
    return `<select name="${name}"${dependsAttr}${classificationAttr}><option value=""></option>${opts}</select>`;
  }
  return `<input name="${name}" value="${escapeHtml(value)}">`;
}

// 부모 <select> 값이 바뀔 때마다 data-depends-on 으로 그 부모를 지목한 자식 <select> 의
// 선택지 중 data-parent 가 일치하지 않는 것만 숨긴다. 부모를 아직 안 골랐으면 전부 숨김
// (선택지가 관리자 설정에 없는 독립 필드는 data-depends-on 자체가 없어 영향 없음).
const CASCADING_SELECT_SCRIPT = `<script>
(function(){
  document.querySelectorAll('select[data-depends-on]').forEach(function(sel){
    var parent = document.querySelector('[name="' + sel.getAttribute('data-depends-on') + '"]');
    if (!parent) return;
    function sync(){
      var pv = parent.value;
      Array.prototype.forEach.call(sel.querySelectorAll('option[data-parent]'), function(o){
        o.hidden = (pv === '' || o.getAttribute('data-parent') !== pv);
      });
      if (sel.selectedOptions[0] && sel.selectedOptions[0].hidden) sel.value = '';
      sel.dispatchEvent(new Event('change'));
    }
    parent.addEventListener('change', sync);
    sync();
  });
})();
</script>`;

function dailyClassificationScript() {
  return `<script>
(function(){
  var rows=${JSON.stringify(DAILY_CLASSIFICATION_ROWS)};
  var selects=Array.prototype.slice.call(document.querySelectorAll('select[data-classification-level]'))
    .sort(function(a,b){ return Number(a.dataset.classificationLevel)-Number(b.dataset.classificationLevel); });
  function syncFrom(level){
    for(var i=level+1;i<selects.length;i++){
      var prefixComplete=selects.slice(0,i).every(function(select){ return !!select.value; });
      var allowed=new Set(rows.filter(function(row){
        for(var j=0;j<i;j++){ if(selects[j].value && row[j]!==selects[j].value) return false; }
        return true;
      }).map(function(row){ return row[i] || ''; }));
      Array.prototype.forEach.call(selects[i].options,function(option){
        if(!option.value) return;
        option.hidden=!prefixComplete || !allowed.has(option.value);
        option.disabled=option.hidden;
      });
      if(selects[i].selectedOptions[0] && selects[i].selectedOptions[0].hidden) selects[i].value='';
      if(i===4) selects[i].required=prefixComplete && !allowed.has('');
    }
  }
  selects.forEach(function(select,index){ select.addEventListener('change',function(){ syncFrom(index); }); });
  syncFrom(-1);

  var product=document.querySelector('[data-product-info]');
  var output=document.querySelector('[data-product-match]');
  if(!product || !output) return;
  var timer;
  function checkProducts(){
    var values=product.value.split(/\\r?\\n/).map(function(v){return v.trim();}).filter(Boolean).slice(0,20);
    if(!values.length){ output.textContent=''; return; }
    output.textContent='제품정보 확인 중...';
    Promise.all(values.map(function(value){
      return fetch('/api/product-match?q='+encodeURIComponent(value)).then(function(r){return r.json();})
        .then(function(result){ return value+' : '+(result.matches[0]?.display || '일치 제품 없음'); })
        .catch(function(){ return value+' : 조회 실패'; });
    })).then(function(lines){ output.textContent=lines.join(' / '); });
  }
  product.addEventListener('input',function(){ clearTimeout(timer); timer=setTimeout(checkProducts,300); });
  checkProducts();
})();
</script>`;
}

async function matchProductRows(env, rawQuery) {
  const query = String(rawQuery || "").trim().slice(0, 80);
  if (!query) return null;
  const isSsd = /^MZ/i.test(query);
  const setCode = isSsd ? "SSD_PRODUCT" : "DM_PRODUCT";
  const keyPath = isSsd ? "$.SSD_PN" : "$.BASE_PN";
  // Module(DM) 파트넘버는 세대별로 기준 P/N 길이가 다르다 — 표준 세대(D1a/D1b/D1y 등)는 16자리,
  // D1bp/D1c는 파트넘버 체계 변경으로 12자리다(2026-09-16, 운영 마스터 데이터로 확인). 앞자리를
  // 16자리로 먼저 찾고 없으면 12자리로 재시도해서 두 체계를 모두 지원한다. SSD는 이 문제가 없어
  // 입력값 전체를 그대로 사용한다.
  const candidates = isSsd ? [query] : [...new Set([query.slice(0, 16), query.slice(0, 12)])].filter(Boolean);
  for (const candidate of candidates) {
    const result = await env.DB.prepare(
      `SELECT r.row_key, r.data_json
         FROM tech_master_row r
         JOIN tech_master_set s ON s.id=r.set_id
        WHERE s.code=? AND r.active=1
          AND (upper(r.row_key)=upper(?) OR upper(COALESCE(json_extract(r.data_json, ?),''))=upper(?)
               OR instr(upper(COALESCE(json_extract(r.data_json, ?),'')),upper(?))>0)
        ORDER BY CASE WHEN upper(COALESCE(json_extract(r.data_json, ?),''))=upper(?) THEN 0 ELSE 1 END, r.row_key
        LIMIT 5`
    ).bind(setCode, candidate, keyPath, candidate, keyPath, candidate, keyPath, candidate).all();
    if (result.results.length) return { setCode, rows: result.results.map((row) => buildProductMatchDisplay(row, isSsd)) };
  }
  return { setCode, rows: [] };
}

// SSD는 기존 표시 방식(부품번호 · 모델명 · Density)을 유지한다. Module(DM)은 요약을
// "Gen. IC버전 Density Speed 폼팩터" 순으로 압축한다(예: "D1bp VC 32GB 6400 RDIMM") —
// 폼팩터는 MDL_INFO("D5 RDIMM" 등)의 마지막 단어만 취해 DDR 세대 접두어(D5 등)는 뺀다.
function buildProductMatchDisplay(row, isSsd) {
  let data = {};
  try { data = JSON.parse(row.data_json || "{}"); } catch (_) {}
  if (isSsd) {
    const partNumber = data.SSD_PN || row.row_key;
    const details = [data.MODEL_NAME, data.DENSITY].filter(Boolean);
    return { partNumber, display: [partNumber, ...details].join(" · ") };
  }
  const partNumber = data.BASE_PN || row.row_key;
  const formFactor = String(data.MDL_INFO || "").trim().split(/\s+/).pop() || "";
  const details = [data.GEN, data.IC_VER, data.DENSITY, data.SPEED, formFactor].filter(Boolean);
  return { partNumber, display: details.join(" ") };
}

async function apiProductMatch(request, env) {
  const query = String(new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  const result = await matchProductRows(env, query);
  return json({ source: result?.setCode || null, matches: result?.rows || [] });
}

// 새 항목 등록 제목의 마지막 [ ] 조각을 만든다. 입력된 파트넘버를 줄 단위로 각각 매칭해
// 압축 표시를 구하고, 같은 결과가 반복되면 하나로 합친다(여러 줄이 보통 같은 기준정보를
// 가리키므로). 일치하는 마스터 행이 하나도 없으면 정보 유실을 막기 위해 입력한 파트넘버
// 원문 첫 줄을 그대로 쓴다.
async function describePartNumberMatches(env, rawValue) {
  const lines = String(rawValue || "").split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  if (!lines.length) return "";
  const results = await mapWithConcurrency(lines, 6, (line) => matchProductRows(env, line));
  const displays = results.map((result) => result?.rows[0]?.display).filter(Boolean);
  return displays.length ? [...new Set(displays)].join("/") : lines[0];
}

// #endregion

// #region 일일업무 항목 상세 · 업데이트 추가

async function pageDailyItemDetail(request, env, user, id) {
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

async function handleDailyItemAddUpdate(request, env, user, id) {
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

async function handleDailyItemDelete(request, env, user, id, updateId = null) {
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

async function handleDailyItemClose(request, env, user, id) {
  const item = await env.DB.prepare(`SELECT closed_at FROM tech_daily_item WHERE id = ?`).bind(id).first();
  if (!item) return redirect("/daily-items");

  const nextClosedAt = item.closed_at ? null : new Date().toISOString().replace("Z", "");
  await env.DB.prepare(`UPDATE tech_daily_item SET closed_at = ? WHERE id = ?`).bind(nextClosedAt, id).run();

  return redirect(`/daily-items/${id}`);
}

// #endregion

// #region 사용자 관리 (/admin/users) — 승인 · 승격 · 강등 · 차단

// 사용자 관리 화면도 일일업무·기준정보와 같은 조밀한 머리글·표 카드 디자인을 쓴다(2026-10-04).

// #endregion

// #region 일일보고 입력항목 설정 (/daily-fields)

const DAILY_REPORT_FIELD_TEMPLATE = [
  ["소속부서", "Department", "Bộ phận", "select", 10],
  ["업무구분", "Work Category", "Phân loại công việc", "select", 20],
  ["업무유형", "Work Type", "Loại công việc", "select", 30],
  ["중분류", "Subcategory", "Phân loại phụ", "select", 40],
  ["소분류", "Detail Category", "Phân loại chi tiết", "select", 50],
  ["추가입력", "Additional Input", "Thông tin bổ sung", "text", 60],
  ["파트넘버", "Part Number", "Mã linh kiện", "textarea", 70],
  ["LOTID", "LOTID", "LOTID", "textarea", 80],
];

async function applyDailyReportFieldTemplate(env) {
  const statements = [
    env.DB.prepare("DELETE FROM tech_daily_update"),
    env.DB.prepare("DELETE FROM tech_daily_report"),
    env.DB.prepare("DELETE FROM tech_daily_field"),
  ];
  for (const [label, en, vi, inputType, order] of DAILY_REPORT_FIELD_TEMPLATE) {
    statements.push(env.DB.prepare(
      "INSERT INTO tech_daily_field(label,label_en,label_vi,input_type,sort_order) VALUES (?,?,?,?,?)"
    ).bind(label, en, vi, inputType, order));
  }
  DAILY_CLASSIFICATION_FIELDS.forEach((label, level) => {
    classificationOptions(level).forEach((value, index) => statements.push(env.DB.prepare(
      "INSERT INTO tech_daily_field_option(field_id,value,sort_order) SELECT id,?,? FROM tech_daily_field WHERE label=?"
    ).bind(value, (index + 1) * 10, label)));
  });
  await env.DB.batch(statements);
}

async function handleDailyFieldTemplateApply(request, env, user) {
  if (user.role !== "admin") return forbiddenResponse(user, getLang(request), t(getLang(request)));
  await applyDailyReportFieldTemplate(env);
  return redirect("/daily-fields?standardApplied=1");
}

async function fieldTransfer(request, env, user, exporting) {
  const lang = getLang(request), L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);
  const words = {
    ko: ["일일보고 항목 관리 CSV", "설정 항목·입력유형·순서·번역·선택값·상위 연결을 가져오고 내보냅니다. 같은 항목명은 번역·순서·상위항목을 갱신하며 선택값은 추가합니다. 기존 항목의 입력유형 변경 및 삭제는 상세 설정에서 처리하세요. 여러 선택값은 항목 정보를 반복하여 행마다 하나씩 작성합니다. UTF-8 CSV, 최대 500행·1MB.", "빈 양식", "검사 및 미리보기", "설정 반영", "반영 완료", "파일 오류: ", "신규", "갱신", "중복 선택값", "돌아가기"],
    en: ["Daily field settings CSV", "Import/export fields, types, order, translations, options and parent links. Matching names update translations, order and parent fields, while choices are added. Change an existing input type or delete a field in detail settings. Repeat field metadata for each option. UTF-8 CSV, up to 500 rows / 1MB.", "Blank template", "Validate and preview", "Apply settings", "Applied", "File error: ", "New", "Update", "Duplicate option", "Back"],
    vi: ["CSV cài đặt mục báo cáo", "Nhập/xuất mục, kiểu, thứ tự, bản dịch, lựa chọn và liên kết cha. Tên trùng sẽ cập nhật bản dịch, thứ tự và mục cha; các lựa chọn được thêm vào. Đổi kiểu nhập hoặc xóa mục tại cài đặt chi tiết. Lặp thông tin mục cho mỗi lựa chọn. CSV UTF-8, tối đa 500 dòng / 1MB.", "Mẫu trống", "Kiểm tra và xem trước", "Áp dụng", "Đã áp dụng", "Lỗi file: ", "Mới", "Cập nhật", "Lựa chọn trùng", "Quay lại"],
  }[lang];
  const fields = (await loadDailyFields(env)).fields;
  const options = (await env.DB.prepare("SELECT * FROM tech_daily_field_option ORDER BY sort_order,id").all()).results;
  const byId = new Map(fields.map(f => [f.id, f]));
  if (exporting) {
    const rows = new URL(request.url).searchParams.get("template") === "1" ? [] : fields.flatMap(f => {
      const metadata = [f.label, f.label_en, f.label_vi, f.input_type, f.sort_order, byId.get(f.depends_on_field_id)?.label || ""];
      const choices = options.filter(o => o.field_id === f.id);
      return choices.length ? choices.map(o => [...metadata, o.value, o.sort_order, options.find(p => p.id === o.parent_option_id)?.value || ""]) : [[...metadata, "", "", ""]];
    });
    return new Response(fieldCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="daily-field-settings.csv"', "cache-control": "no-store" } });
  }
  let notice = "", source = "", preview = [], valid = false;
  if (request.method === "POST") {
    try {
      const reader = request.body.getReader(), chunks = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw Error("1MB"); } chunks.push(value); }
      const form = await new Response(new Blob(chunks), { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
      const confirm = form.get("confirm") === "1";
      if (confirm) source = String(form.get("csv") || "");
      else {
        const file = form.get("file");
        if (!file || typeof file.arrayBuffer !== "function" || !file.name.toLowerCase().endsWith(".csv") || file.size > 1024 * 1024) throw Error("CSV UTF-8 / 1MB");
        source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      }
      const rows = parseFieldCsv(source);
      if (!rows.length) throw Error("0 rows");
      const existing = new Map();
      for (const f of fields) { if (existing.has(f.label)) throw Error(`Duplicate field name: ${f.label}`); existing.set(f.label, f); }
      const incoming = new Map(), choices = [];
      rows.forEach((r, index) => {
        const [name, en, vi, type, order, parent, value, optionOrder, parentValue] = r;
        const fail = reason => { throw Error(`${index + 2}: ${reason}`); };
        if (r.length !== FIELD_HEADERS.length || !name || name.length > 200 || r.some(v => v.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) || !["text", "textarea", "select"].includes(type) || !/^\d{1,6}$/.test(order)) fail("항목명 / text, textarea, select / 순서 0–999999");
        if (hasDailyClassification(fields) && RETIRED_DAILY_FIELDS.has(name)) fail(lotWords[lang].retired);
        if (name === "LOTID" && (type !== "textarea" || parent)) fail("LOTID / textarea / no parent");
        const metadata = { label: name, label_en: en, label_vi: vi, input_type: type, sort_order: Number(order), parent };
        if (incoming.has(name) && JSON.stringify(incoming.get(name)) !== JSON.stringify(metadata)) fail(`Conflicting metadata: ${name}`);
        const old = existing.get(name);
        if (old && old.input_type !== type) fail(`Existing type: ${name}`);
        if (type !== "select" && (parent || value || parentValue)) fail("select required");
        incoming.set(name, metadata);
        if (value) {
          if (!/^\d{1,6}$/.test(optionOrder)) fail("선택순서 0–999999");
          if (!!parent !== !!parentValue) fail("상위선택값 / parent option");
          if (name === "상태" && !options.some(o => o.field_id === old?.id && o.value === value)) fail("Managed status options");
          const choice = { name, value, order: Number(optionOrder), parentValue };
          if (choices.some(c => c.name === name && c.value === value && c.parentValue === parentValue)) fail(`Duplicate option: ${value}`);
          choices.push(choice);
        } else if (optionOrder || parentValue) fail("선택값 / option value");
        preview.push({ r, status: old ? words[8] : words[7] });
      });
      const all = new Map([...existing].map(([name, f]) => [name, { ...f, parent: byId.get(f.depends_on_field_id)?.label || "" }]));
      for (const [name, f] of incoming) all.set(name, f);
      // Strictly increasing order makes parent links acyclic, including existing children.
      for (const f of all.values()) if (f.parent) {
        const parent = all.get(f.parent);
        if (f.input_type !== "select" || !parent || parent.input_type !== "select" || parent.sort_order >= f.sort_order) throw Error(`Parent must precede child: ${f.label}`);
      }
      const parentIdFor = c => {
        const name = all.get(c.name).parent;
        return options.filter(o => o.field_id === existing.get(name)?.id && o.value === c.parentValue);
      };
      for (const c of choices) if (c.parentValue) {
        const old = parentIdFor(c);
        const added = choices.filter(p => p.name === all.get(c.name).parent && p.value === c.parentValue);
        if (!old.length && !added.length) throw Error(`Missing parent option: ${c.parentValue}`);
      }
      valid = true;
      if (confirm) {
        const statements = [];
        for (const f of [...incoming.values()].sort((a,b) => a.sort_order - b.sort_order)) {
          const old = existing.get(f.label);
          if (old) statements.push(env.DB.prepare("UPDATE tech_daily_field SET label_en=?,label_vi=?,sort_order=?,depends_on_field_id=(SELECT id FROM tech_daily_field WHERE label=?) WHERE id=?").bind(f.label_en || null, f.label_vi || null, f.sort_order, f.parent, old.id));
          else statements.push(env.DB.prepare("INSERT INTO tech_daily_field(label,label_en,label_vi,input_type,sort_order,depends_on_field_id) SELECT ?,?,?,?,?,(SELECT id FROM tech_daily_field WHERE label=?) WHERE NOT EXISTS(SELECT 1 FROM tech_daily_field WHERE label=?)").bind(f.label, f.label_en || null, f.label_vi || null, f.input_type, f.sort_order, f.parent, f.label));
        }
        const claimedOrphans = new Set();
        for (const c of choices.sort((a,b) => all.get(a.name).sort_order - all.get(b.name).sort_order)) {
          const old = options.filter(o => o.field_id === existing.get(c.name)?.id && o.value === c.value && (options.find(p => p.id === o.parent_option_id)?.value || "") === c.parentValue);
          for (const item of old) statements.push(env.DB.prepare("UPDATE tech_daily_field_option SET sort_order=? WHERE id=?").bind(c.order, item.id));
          if (c.parentValue) {
            const orphan = options.find(o => o.field_id === existing.get(c.name)?.id && o.value === c.value && !o.parent_option_id && !claimedOrphans.has(o.id));
            if (!old.length && orphan) {
              claimedOrphans.add(orphan.id);
              statements.push(env.DB.prepare(`UPDATE tech_daily_field_option SET sort_order=?,parent_option_id=(
                SELECT MIN(po.id) FROM tech_daily_field_option po JOIN tech_daily_field pf ON pf.id=po.field_id WHERE pf.label=? AND po.value=?
              ) WHERE id=?`).bind(c.order, all.get(c.name).parent, c.parentValue, orphan.id));
            }
            statements.push(env.DB.prepare(`INSERT INTO tech_daily_field_option(field_id,value,sort_order,parent_option_id)
              SELECT f.id,?,?,po.id FROM tech_daily_field f
              JOIN tech_daily_field pf ON pf.label=?
              JOIN tech_daily_field_option po ON po.field_id=pf.id AND po.value=?
              WHERE f.label=? AND NOT EXISTS(
                SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value=? AND o.parent_option_id=po.id
              )`).bind(c.value, c.order, all.get(c.name).parent, c.parentValue, c.name, c.value));
          } else if (!old.length) {
            statements.push(env.DB.prepare(`INSERT INTO tech_daily_field_option(field_id,value,sort_order,parent_option_id)
              SELECT f.id,?,?,NULL FROM tech_daily_field f WHERE f.label=?
              AND NOT EXISTS(SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value=? AND o.parent_option_id IS NULL)`)
              .bind(c.value, c.order, c.name, c.value));
          }
        }
        await env.DB.batch(statements);
        notice = `${words[5]} (${incoming.size})`; preview = []; valid = false;
      }
    } catch (error) { valid = false; notice = words[6] + (error instanceof Error ? error.message : "CSV"); }
  }
  return html(layout({ title: words[0], user, lang, activeNav: "daily", mainClass: "daily-work-page", body: `
    ${dailyWorkSubtabs(L, "settings", user)}<h2>${escapeHtml(words[0])}</h2><div class="card"><p>${escapeHtml(words[1])}</p>
    <p><a href="/daily-fields/export?template=1">${escapeHtml(words[2])}</a> · <a href="/daily-fields/export">CSV Export</a> · <a href="/daily-fields">${escapeHtml(words[10])}</a></p>
    <p>입력유형: text / textarea / select · 순서/선택순서: 0–999999 · 상위항목: 항목명 · 상위선택값: 선택값</p>
    <form method="post" enctype="multipart/form-data"><label>CSV UTF-8<input type="file" name="file" accept=".csv" required></label><button>${escapeHtml(words[3])}</button></form></div>
    ${notice ? `<p role="status">${escapeHtml(notice)}</p>` : ""}
    ${preview.length ? `<div class="card" style="overflow-x:auto;"><table><thead><tr>${FIELD_HEADERS.map(h => `<th>${escapeHtml(h)}</th>`).join("")}<th></th></tr></thead><tbody>${preview.map(p => `<tr>${p.r.map(v => `<td>${escapeHtml(v)}</td>`).join("")}<td>${escapeHtml(p.status)}</td></tr>`).join("")}</tbody></table>
    ${valid ? `<form method="post" enctype="multipart/form-data"><input type="hidden" name="confirm" value="1"><textarea name="csv" hidden>${escapeHtml(source)}</textarea><button>${escapeHtml(words[4])}</button></form>` : ""}</div>` : ""}` }));
}

async function pageDailyFields(request, env, user) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const { fields } = await loadDailyFields(env);
  const standardApplied = new URL(request.url).searchParams.has("standardApplied");
  const fieldById = Object.fromEntries(fields.map((f) => [f.id, f]));
  const fieldTranslations = await buildDisplayTranslationMap(
    env,
    fields.filter((field) => !((lang === "en" && field.label_en) || (lang === "vi" && field.label_vi))).map((field) => field.label),
    lang
  );
  // fields는 이미 sort_order 순으로 정렬되어 있음 — 이 순서가 실제 업데이트 입력 폼
  // (pageDailyItemDetail의 fieldInputs)에 그대로 반영된다. 위/아래 버튼은 인접한 필드와
  // sort_order를 맞바꿔서 순서를 바꾼다.
  const rows = fields.map((f, i) => `
    <tr>
      <td>
        <form method="post" action="/daily-fields/${f.id}/move" class="inline">
          <input type="hidden" name="direction" value="up">
          <button type="submit" class="secondary" title="${escapeHtml(L.moveUpTitle)}" ${i === 0 ? "disabled" : ""}>▲</button>
        </form>
        <form method="post" action="/daily-fields/${f.id}/move" class="inline">
          <input type="hidden" name="direction" value="down">
          <button type="submit" class="secondary" title="${escapeHtml(L.moveDownTitle)}" ${i === fields.length - 1 ? "disabled" : ""}>▼</button>
        </form>
      </td>
      <td>${f.label === "LOTID" ? "LOTID" : `<a href="/daily-fields/${f.id}">${escapeHtml(resolveFieldLabel(f, lang, fieldTranslations))}</a>`}</td>
      <td>${escapeHtml(f.label_en || "-")}</td>
      <td>${escapeHtml(f.label_vi || "-")}</td>
      <td>${escapeHtml(L["inputType" + f.input_type[0].toUpperCase() + f.input_type.slice(1)])}</td>
      <td>${f.input_type === "select" ? f.options.length : "-"}</td>
      <td>${f.depends_on_field_id && fieldById[f.depends_on_field_id] ? escapeHtml(resolveFieldLabel(fieldById[f.depends_on_field_id], lang, fieldTranslations)) : "-"}</td>
    </tr>`).join("");

  // 새로 만드는 필드는 항상 sort_order가 가장 크게 배정되므로, 기존 select 필드는
  // 전부 "더 앞선" 필드가 되어 순환 참조 걱정 없이 상위 항목 후보가 될 수 있다.
  const selectFields = fields.filter((f) => f.input_type === "select");
  const dependsOnOptions = selectFields.map((f) =>
    `<option value="${f.id}">${escapeHtml(resolveFieldLabel(f, lang, fieldTranslations))}</option>`
  ).join("");

  return html(layout({
    title: L.dailyFieldsHeading, user, lang, activeNav: "daily", mainClass: "daily-work-page", body: `
    ${dailyWorkSubtabs(L, "settings", user)}
    <div class="card">
      <h2 style="margin-top:0;">일일보고 분류 기준</h2>
      ${standardApplied ? `<p role="status">표준 분류와 LOTID를 적용하고 기존 보고 이력을 삭제했습니다.</p>` : ""}
      <p class="muted">MDL·SSD 통합관리기준의 70개 조합을 사용합니다. 화면에서는 기존 파트명에 맞춰 MDL을 Module로 표시합니다.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0;">
        ${[...DAILY_CLASSIFICATION_FIELDS, "Product Info.", "LOTID", "LOT 조회 결과"].map((label, index, all) => `<span style="display:flex;gap:8px;align-items:center;"><strong style="padding:8px 12px;background:var(--accent-soft);color:var(--accent-soft-text);border-radius:6px;">${escapeHtml(label)}</strong>${index < all.length - 1 ? "→" : ""}</span>`).join("")}
      </div>
      <form method="post" action="/daily-fields/apply-standard" onsubmit="return confirm('기존 일일보고 이력과 현재 항목 설정을 삭제하고 표준 설정으로 교체합니다. 계속하시겠습니까?');">
        <button type="submit">표준 설정 적용</button>
      </form>
    </div>
    <div class="card">
      <h2 style="margin-top:0;">${escapeHtml(L.newFieldHeading)}</h2>
      <form method="post" action="/daily-fields/new">
        <label>${escapeHtml(L.fieldNameLabel)}</label>
        <input name="name" required>
        <p class="muted">${escapeHtml(L.fieldNameHint)}</p>
        <div class="row">
          <div><label>${escapeHtml(L.fieldInputType)}</label>
            <select name="input_type">
              <option value="text">${escapeHtml(L.inputTypeText)}</option>
              <option value="textarea">${escapeHtml(L.inputTypeTextarea)}</option>
              <option value="select">${escapeHtml(L.inputTypeSelect)}</option>
            </select>
          </div>
          <div><label>${escapeHtml(L.dependsOnLabel)}</label>
            <select name="depends_on_field_id">
              <option value="">${escapeHtml(L.dependsOnNone)}</option>
              ${dependsOnOptions}
            </select>
          </div>
        </div>
        <p class="muted">${escapeHtml(L.dependsOnHint)}</p>
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </div>
    <div class="card">
      <h2 style="margin-top:0;">${escapeHtml(L.dailyItemsHeading)}</h2>
      <p><a href="/daily-fields/import">CSV Import</a> · <a href="/daily-fields/export">CSV Export</a></p>
      <table>
        <thead><tr><th>${escapeHtml(L.colSortOrder)}</th><th>${escapeHtml(L.fieldLabel)}</th><th>${escapeHtml(L.colLabelEn)}</th><th>${escapeHtml(L.colLabelVi)}</th><th>${escapeHtml(L.fieldInputType)}</th><th>${escapeHtml(L.colOptions)}</th><th>${escapeHtml(L.dependsOnLabel)}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">${escapeHtml(L.noItems)}</td></tr>`}</tbody>
      </table>
    </div>` }));
}

async function handleDailyFieldCreate(request, env, user) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const inputType = ["text", "textarea", "select"].includes(String(form.get("input_type"))) ? String(form.get("input_type")) : "text";
  if (!name) return redirect("/daily-fields");

  // depends_on 은 select 타입 필드에만 의미가 있고, 대상도 반드시 실제 존재하는 select 필드여야 한다.
  let dependsOnFieldId = null;
  const rawDependsOn = String(form.get("depends_on_field_id") || "").trim();
  if (inputType === "select" && rawDependsOn) {
    const target = await env.DB.prepare(`SELECT id FROM tech_daily_field WHERE id = ? AND input_type = 'select'`).bind(rawDependsOn).first();
    if (target) dependsOnFieldId = target.id;
  }

  const tri = await resolveTrilingualText(env, name);
  const label = tri.ko || name;
  if (hasDailyClassification((await loadDailyFields(env)).fields) && (RETIRED_DAILY_FIELDS.has(label) || RETIRED_DAILY_FIELDS.has(name) || label === "LOTID" || name === "LOTID")) return plainText(lotWords[getLang(request)].retired, 400);

  const max = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM tech_daily_field`).first();
  await env.DB.prepare(
    `INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order, depends_on_field_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(label, tri.en, tri.vi, inputType, (max.m || 0) + 10, dependsOnFieldId).run();

  return redirect("/daily-fields");
}

async function pageDailyFieldDetail(request, env, user, id) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const field = await env.DB.prepare(`SELECT * FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return html(layout({ title: L.notFoundTitle, user, lang, body: `<div class="card">${escapeHtml(L.fieldNotFound)}</div>` }), 404);

  const url = new URL(request.url);
  const importNotice = url.searchParams.has("imported")
    ? L.importResultTemplate
        .replace("{added}", url.searchParams.get("imported"))
        .replace("{skipped}", url.searchParams.get("skipped") || "0")
    : null;
  const deleteBlockedNotice = url.searchParams.has("deleteBlocked")
    ? L.deleteFieldInUse.replace("{count}", url.searchParams.get("deleteBlocked") || "0")
    : null;

  // depends_on 후보: 자기 자신을 제외한 select 필드 중, 자기보다 먼저 만들어진(=sort_order가
  // 더 작은) 필드만 — 이래야 상위 필드가 반드시 먼저 존재해서 순환 참조가 생기지 않는다.
  const { fields: allFields } = await loadDailyFields(env);
  const parentCandidates = allFields.filter((f) => f.input_type === "select" && f.id !== field.id && f.sort_order < field.sort_order);
  const dependsOnField = field.depends_on_field_id ? allFields.find((f) => f.id === field.depends_on_field_id) : null;
  const parentOptions = dependsOnField ? dependsOnField.options : [];
  const settingsTranslations = await buildDisplayTranslationMap(env, [
    ...allFields.filter((candidate) => !((lang === "en" && candidate.label_en) || (lang === "vi" && candidate.label_vi))).map((candidate) => candidate.label),
    ...allFields.flatMap((candidate) => candidate.options.map((option) => option.value)),
  ], lang);
  const parentRequiredNotice = (url.searchParams.has("needsParent") && dependsOnField)
    ? L.parentOptionRequiredNotice.replace("{label}", resolveFieldLabel(dependsOnField, lang, settingsTranslations))
    : null;

  const options = await env.DB.prepare(`SELECT * FROM tech_daily_field_option WHERE field_id = ? ORDER BY sort_order, id`).bind(id).all();
  const isManagedStatusField = field.label === "상태";
  const parentValueById = Object.fromEntries(parentOptions.map((o) => [o.id, resolveOptionValue(o.value, lang, settingsTranslations, dependsOnField?.label === "상태")]));
  const optionRows = options.results.map((o) => `
    <tr>
      ${dependsOnField ? `<td>${escapeHtml(o.parent_option_id ? (parentValueById[o.parent_option_id] || "-") : "-")}</td>` : ""}
      <td>${escapeHtml(resolveOptionValue(o.value, lang, settingsTranslations, isManagedStatusField))}</td>
      <td>${isManagedStatusField ? "" : `<form method="post" action="/daily-fields/${field.id}/options/${o.id}/delete" onsubmit="return confirm('${escapeHtml(L.deleteOptionConfirm)}');">
        <button type="submit" class="danger">${escapeHtml(L.deleteBtn)}</button>
      </form>`}</td>
    </tr>`).join("");

  const dependsOnOptionsHtml = parentCandidates.map((f) =>
    `<option value="${f.id}" ${field.depends_on_field_id === f.id ? "selected" : ""}>${escapeHtml(resolveFieldLabel(f, lang, settingsTranslations))}</option>`
  ).join("");

  const parentOptionSelect = dependsOnField ? `<select name="parent_option_id" required>
      <option value="">-</option>
      ${parentOptions.map((o) => `<option value="${o.id}">${escapeHtml(resolveOptionValue(o.value, lang, settingsTranslations, dependsOnField?.label === "상태"))}</option>`).join("")}
    </select>` : "";

  const canAddOptions = !isManagedStatusField && (!dependsOnField || parentOptions.length > 0);
  const addOptionForm = isManagedStatusField
    ? `<p class="muted">${escapeHtml(L.statusOptionsManagedNotice)}</p>`
    : !canAddOptions
    ? `<p class="muted">${escapeHtml(L.noParentOptionsNotice.replace("{label}", resolveFieldLabel(dependsOnField, lang, settingsTranslations)))}</p>`
    : `<form method="post" action="/daily-fields/${field.id}/options/new" class="row">
        ${dependsOnField ? `<div><label>${escapeHtml(L.parentOptionLabel)}</label>${parentOptionSelect}</div>` : ""}
        <div><label>${escapeHtml(L.addOptionPlaceholder)}</label><input name="value" placeholder="${escapeHtml(L.addOptionPlaceholder)}" required></div>
        <div style="flex:0;align-self:end;"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>`;

  const bulkImportForm = !canAddOptions ? "" : `
    <div class="card">
      <h3 style="margin-top:0;">${escapeHtml(L.bulkAddOptionsHeading)}</h3>
      <p class="muted">${escapeHtml(L.bulkAddNotice)}</p>
      <form method="post" action="/daily-fields/${field.id}/options/import" enctype="multipart/form-data">
        ${dependsOnField ? `<label>${escapeHtml(L.parentOptionLabel)}</label>${parentOptionSelect}` : ""}
        <label>${escapeHtml(L.bulkAddFileLabel)}</label>
        <input type="file" name="csv_file" accept=".csv,.txt">
        <label>${escapeHtml(L.bulkAddPasteLabel)}</label>
        <textarea name="csv_text" placeholder="OCAP&#10;분석/Issue"></textarea>
        <label><input type="checkbox" name="skip_header" style="width:auto;"> ${escapeHtml(L.skipHeaderLabel)}</label>
        <div style="margin-top:8px;"><button type="submit">${escapeHtml(L.submit)}</button></div>
      </form>
    </div>`;

  return html(layout({
    title: resolveFieldLabel(field, lang, settingsTranslations), user, lang, activeNav: "daily", mainClass: "daily-work-page", body: `
    <p><a href="/daily-fields">${escapeHtml(L.backToList)}</a></p>
    <div class="card">
      <h2 style="margin-top:0;">${escapeHtml(resolveFieldLabel(field, lang, settingsTranslations))}</h2>
      ${deleteBlockedNotice ? `<p class="err">${escapeHtml(deleteBlockedNotice)}</p>` : ""}
      <form method="post" action="/daily-fields/${field.id}">
        <label>${escapeHtml(L.fieldNameLabel)}</label>
        <input name="name" value="${escapeHtml(resolveFieldLabel(field, lang, settingsTranslations))}" required>
        <p class="muted">${escapeHtml(L.fieldNameHint)}</p>
        <div class="row">
          <div><label>${escapeHtml(L.fieldInputType)}</label>
            <select name="input_type">
              <option value="text" ${field.input_type === "text" ? "selected" : ""}>${escapeHtml(L.inputTypeText)}</option>
              <option value="textarea" ${field.input_type === "textarea" ? "selected" : ""}>${escapeHtml(L.inputTypeTextarea)}</option>
              <option value="select" ${field.input_type === "select" ? "selected" : ""}>${escapeHtml(L.inputTypeSelect)}</option>
            </select>
          </div>
          <div><label>${escapeHtml(L.dependsOnLabel)}</label>
            <select name="depends_on_field_id">
              <option value="">${escapeHtml(L.dependsOnNone)}</option>
              ${dependsOnOptionsHtml}
            </select>
          </div>
        </div>
        <p class="muted">${escapeHtml(L.dependsOnHint)}</p>
        <div style="margin-top:12px;"><button type="submit">${escapeHtml(L.save)}</button></div>
      </form>
      <form method="post" action="/daily-fields/${field.id}/delete" style="margin-top:12px;" onsubmit="return confirm('${escapeHtml(L.deleteFieldConfirm)}');">
        <button type="submit" class="danger">${escapeHtml(L.deleteBtn)}</button>
      </form>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">${escapeHtml(L.optionsHeading)}</h3>
      ${importNotice ? `<p class="muted">${escapeHtml(importNotice)}</p>` : ""}
      ${parentRequiredNotice ? `<p class="err">${escapeHtml(parentRequiredNotice)}</p>` : ""}
      ${addOptionForm}
      <table>
        ${dependsOnField ? `<thead><tr><th>${escapeHtml(L.colParentOption)}</th><th>${escapeHtml(L.fieldLabel)}</th><th></th></tr></thead>` : ""}
        <tbody>${optionRows || `<tr><td colspan="${dependsOnField ? 3 : 2}" class="muted">${escapeHtml(L.noItems)}</td></tr>`}</tbody>
      </table>
    </div>
    ${bulkImportForm}` }));
}

async function handleDailyFieldUpdate(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const lang = getLang(request);
  const form = await request.formData();
  if (hasDailyClassification((await loadDailyFields(env)).fields) && (RETIRED_DAILY_FIELDS.has(String(form.get("name") || "").trim()) || String(form.get("name") || "").trim() === "LOTID")) return plainText(lotWords[getLang(request)].retired, 400);
  const name = String(form.get("name") || "").trim();
  const inputType = ["text", "textarea", "select"].includes(String(form.get("input_type"))) ? String(form.get("input_type")) : "text";
  if (!name) return redirect(`/daily-fields/${id}`);

  const field = await env.DB.prepare(`SELECT * FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return redirect("/daily-fields");

  let dependsOnFieldId = null;
  const rawDependsOn = String(form.get("depends_on_field_id") || "").trim();
  if (inputType === "select" && rawDependsOn) {
    const target = await env.DB.prepare(
      `SELECT id FROM tech_daily_field WHERE id = ? AND input_type = 'select' AND id != ? AND sort_order < ?`
    ).bind(rawDependsOn, id, field.sort_order).first();
    if (target) dependsOnFieldId = target.id;
  }

  // 관리자가 지금 보고 있던(=현재 화면 언어로 보이던) 이름 그대로 다시 제출했다면 이름은
  // 안 바꾼 것이므로 재번역하지 않는다 — input_type만 바꾸는 흔한 경우에 매번 AI를
  // 호출해서 저장이 느려지는 걸 막기 위함.
  const unchanged = name === resolveFieldLabel(field, lang);
  const tri = unchanged
    ? { ko: field.label, en: field.label_en, vi: field.label_vi }
    : await resolveTrilingualText(env, name);
  const label = tri.ko || name;
  if (hasDailyClassification((await loadDailyFields(env)).fields) && (RETIRED_DAILY_FIELDS.has(label) || label === "LOTID")) return plainText(lotWords[lang].retired, 400);

  await env.DB.prepare(`UPDATE tech_daily_field SET label = ?, label_en = ?, label_vi = ?, input_type = ?, depends_on_field_id = ? WHERE id = ?`)
    .bind(label, tri.en, tri.vi, inputType, dependsOnFieldId, id).run();

  // 이 필드가 더 이상 select 타입이 아니면, 이 필드에 의존하던 다른 필드들은 상위 항목을 잃는다.
  if (inputType !== "select") {
    await env.DB.prepare(`UPDATE tech_daily_field SET depends_on_field_id = NULL WHERE depends_on_field_id = ?`).bind(id).run();
  }

  return redirect(`/daily-fields/${id}`);
}

async function handleDailyFieldDelete(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const { count } = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM tech_daily_update_value WHERE field_id = ?`
  ).bind(id).first();
  if (count > 0) return redirect(`/daily-fields/${id}?deleteBlocked=${count}`);
  await env.DB.prepare(`DELETE FROM tech_daily_field WHERE id = ?`).bind(id).run();
  return redirect("/daily-fields");
}

// 인접한 필드와 sort_order 를 맞바꿔서 순서를 한 칸 옮긴다. 전역 정렬 기준인
// `ORDER BY sort_order, id`와 동일한 규칙으로 "바로 앞/뒤" 필드를 찾는다.
async function handleDailyFieldMove(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const form = await request.formData();
  const direction = String(form.get("direction") || "");

  const field = await env.DB.prepare(`SELECT id, sort_order FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return redirect("/daily-fields");

  const neighbor = direction === "up"
    ? await env.DB.prepare(
        `SELECT id, sort_order FROM tech_daily_field WHERE (sort_order < ?) OR (sort_order = ? AND id < ?) ORDER BY sort_order DESC, id DESC LIMIT 1`
      ).bind(field.sort_order, field.sort_order, field.id).first()
    : direction === "down"
    ? await env.DB.prepare(
        `SELECT id, sort_order FROM tech_daily_field WHERE (sort_order > ?) OR (sort_order = ? AND id > ?) ORDER BY sort_order ASC, id ASC LIMIT 1`
      ).bind(field.sort_order, field.sort_order, field.id).first()
    : null;

  if (neighbor) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE tech_daily_field SET sort_order = ? WHERE id = ?`).bind(neighbor.sort_order, field.id),
      env.DB.prepare(`UPDATE tech_daily_field SET sort_order = ? WHERE id = ?`).bind(field.sort_order, neighbor.id),
    ]);
  }

  return redirect("/daily-fields");
}

// depends_on_field_id 가 있는 필드는 반드시 그 상위 필드에 실제로 속한 선택지 id 를
// 받아야 한다 — 그래야 다른 필드의 선택지 id 를 잘못 넣는 걸 막을 수 있다.
async function resolveParentOptionId(env, field, rawParentOptionId) {
  if (!field.depends_on_field_id) return null;
  const parentId = String(rawParentOptionId || "").trim();
  if (!parentId) return undefined; // 상위 선택지가 필요한데 안 골랐음 — 호출부에서 거부 처리
  const parentOption = await env.DB.prepare(
    `SELECT id FROM tech_daily_field_option WHERE id = ? AND field_id = ?`
  ).bind(parentId, field.depends_on_field_id).first();
  return parentOption ? parentOption.id : undefined;
}

async function handleDailyFieldOptionCreate(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const field = await env.DB.prepare(`SELECT * FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return redirect("/daily-fields");
  if (field.label === "상태") return redirect(`/daily-fields/${id}`);

  const form = await request.formData();
  const value = String(form.get("value") || "").trim();
  const parentOptionId = await resolveParentOptionId(env, field, form.get("parent_option_id"));

  if (parentOptionId === undefined) return redirect(`/daily-fields/${id}?needsParent=1`);

  if (value) {
    await warmTranslationCache(env, [value]);
    const max = await env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM tech_daily_field_option WHERE field_id = ?`
    ).bind(id).first();
    await env.DB.prepare(
      `INSERT INTO tech_daily_field_option (field_id, value, sort_order, parent_option_id) VALUES (?, ?, ?, ?)`
    ).bind(id, value, (max.m || 0) + 10, parentOptionId).run();
  }
  return redirect(`/daily-fields/${id}`);
}

async function handleDailyFieldOptionDelete(request, env, user, fieldId, optionId) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const field = await env.DB.prepare(`SELECT label FROM tech_daily_field WHERE id = ?`).bind(fieldId).first();
  if (field?.label === "상태") return redirect(`/daily-fields/${fieldId}`);
  await env.DB.prepare(`DELETE FROM tech_daily_field_option WHERE id = ? AND field_id = ?`).bind(optionId, fieldId).run();
  return redirect(`/daily-fields/${fieldId}`);
}

// 한 줄에 값 하나. 쉼표가 있으면 첫 번째 칸만 값으로 쓴다(간단한 선택지 목록용이라
// 따옴표로 감싼 필드 안의 쉼표 같은 완전한 CSV 이스케이프 규칙까지는 다루지 않는다).
function parseCsvValues(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.split(",")[0].trim().replace(/^"(.*)"$/, "$1").trim())
    .filter((v) => v);
}

async function handleDailyFieldOptionImport(request, env, user, id) {
  if (user.role !== "admin") return redirect("/daily-fields");
  const field = await env.DB.prepare(`SELECT * FROM tech_daily_field WHERE id = ?`).bind(id).first();
  if (!field) return redirect("/daily-fields");
  if (field.label === "상태") return redirect(`/daily-fields/${id}`);

  const form = await request.formData();
  const file = form.get("csv_file");
  const pasted = String(form.get("csv_text") || "");
  const skipHeader = form.get("skip_header") === "on";
  const parentOptionId = await resolveParentOptionId(env, field, form.get("parent_option_id"));

  if (parentOptionId === undefined) return redirect(`/daily-fields/${id}?needsParent=1`);

  const text = (file && typeof file.text === "function" && file.size > 0) ? await file.text() : pasted;
  let values = parseCsvValues(text);
  if (skipHeader) values = values.slice(1);
  await warmTranslationCache(env, values);

  // 중복 체크는 (field_id, parent_option_id) 조합 안에서만 한다 — 같은 값이라도
  // 다른 상위 선택지 아래에서는 별개의 선택지로 취급되어야 하기 때문.
  const [existing, max] = await Promise.all([
    parentOptionId === null
      ? env.DB.prepare(`SELECT value FROM tech_daily_field_option WHERE field_id = ? AND parent_option_id IS NULL`).bind(id).all()
      : env.DB.prepare(`SELECT value FROM tech_daily_field_option WHERE field_id = ? AND parent_option_id = ?`).bind(id, parentOptionId).all(),
    env.DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM tech_daily_field_option WHERE field_id = ?`).bind(id).first(),
  ]);
  const existingSet = new Set(existing.results.map((o) => o.value));
  let order = max.m || 0;
  let skipped = 0;
  const seen = new Set();
  const inserts = [];
  for (const v of values) {
    if (existingSet.has(v) || seen.has(v)) { skipped++; continue; }
    seen.add(v);
    order += 10;
    inserts.push(env.DB.prepare(
      `INSERT INTO tech_daily_field_option (field_id, value, sort_order, parent_option_id) VALUES (?, ?, ?, ?)`
    ).bind(id, v, order, parentOptionId));
  }
  // 한 묶음으로 저장해 중간 실패 시 일부 선택지만 남지 않게 한다.
  if (inserts.length) await env.DB.batch(inserts);

  return redirect(`/daily-fields/${id}?imported=${inserts.length}&skipped=${skipped}`);
}

// #endregion

// #region 평가업무 관리 (/tasks/:id, /api/tasks 등)

async function handleTaskCreate(request, env, user) {
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

async function pageTaskDetail(request, env, user, id) {
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

async function handleTaskUpdateStatus(request, env, user, id) {
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

async function handleTaskAddUpdate(request, env, user, id) {
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

// ---------- API (JSON) ----------

async function apiListTasks(request, env) {
  const tasks = await env.DB.prepare(`SELECT * FROM tech_task ORDER BY id DESC`).all();
  return json({ tasks: tasks.results });
}

async function apiListReports(request, env) {
  const reports = await env.DB.prepare(`SELECT * FROM tech_report_log ORDER BY id DESC LIMIT 100`).all();
  return json({ reports: reports.results });
}

async function apiCreateReport(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const { report_type = "weekly", period_start = null, period_end = null, content = "" } = body;
  const res = await env.DB.prepare(
    `INSERT INTO tech_report_log (report_type, period_start, period_end, content, generated_by) VALUES (?, ?, ?, ?, ?)`
  ).bind(report_type, period_start, period_end, content, user.id).run();
  return json({ id: res.meta.last_row_id }, 201);
}

// ---------- 라우터 ----------

// #endregion

// #region 기준정보 (Master Data)
// 일일업무(EAV)와 달리 행당 JSON(data_json) 구조다 — §master_schema.sql 설계 근거 참고.
// field.code는 여기서만 json_extract() SQL 문자열에 직접 이어붙이므로(값은 전부 바인딩),
// 저장 시 MASTER_CODE_RE로 검증해 항상 안전한 문자만 들어오게 강제한다.

const MASTER_PAGE_SIZE = 50;
// 기준정보 화면도 일일업무 화면과 같은 조밀한 카드·도구막대 디자인을 쓴다(2026-10-04).
const MASTER_MAIN_CLASS = "daily-work-page master-page";
const MASTER_DATA_TYPES = ["TEXT", "NUMBER", "SELECT", "YN", "DATE"];
const MASTER_CODE_RE = /^[A-Z][A-Z0-9_]*$/;

function masterSetName(set, lang) {
  return set[`name_${lang}`] || set.name_ko;
}

function masterFieldLabel(field, lang) {
  return field[`label_${lang}`] || field.label_ko;
}

function masterTypeLabel(dataType, L) {
  return { TEXT: L.masterTypeText, NUMBER: L.masterTypeNumber, SELECT: L.masterTypeSelect, YN: L.masterTypeYn, DATE: L.masterTypeDate }[dataType] || dataType;
}

function verifyStatusBadge(status, L) {
  const cls = status === "ERROR" ? "issue" : status === "OK" ? "done" : "";
  const text = status === "ERROR" ? L.verifyStatusError : status === "CHECK" ? L.verifyStatusCheck : L.verifyStatusOk;
  return `<span class="status-pill ${cls}">${escapeHtml(text)}</span>`;
}

function masterTypeOptions(selected, L) {
  return MASTER_DATA_TYPES.map((dt) => `<option value="${dt}" ${selected === dt ? "selected" : ""}>${escapeHtml(masterTypeLabel(dt, L))}</option>`).join("");
}

async function loadMasterFields(env, setId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM tech_master_field WHERE set_id = ? AND active = 1 ORDER BY sort_order, id`
  ).bind(setId).all();
  return results;
}

async function loadMasterSet(env, code) {
  return env.DB.prepare(`SELECT * FROM tech_master_set WHERE code = ?`).bind(code).first();
}

async function masterRowCount(env, setId) {
  const { count } = await env.DB.prepare(`SELECT COUNT(*) AS count FROM tech_master_row WHERE set_id = ?`).bind(setId).first();
  return count;
}

// 현재 쿼리스트링을 복사해 일부 값만 바꾼 뒤 문자열로 돌려준다(정렬·페이지 링크용).
// 값에 null을 주면 그 키를 아예 지운다(예: 정렬 기준이 바뀌면 page는 1로 리셋).
function masterQueryString(url, overrides) {
  const params = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function masterNotFoundPage(user, lang, L, message) {
  return html(layout({ title: message, user, lang, activeNav: "master-data", body: `<div class="card">${escapeHtml(message)}</div>` }), 404);
}

async function pageMasterIndex(request, env, user) {
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

async function pageMasterList(request, env, user, code) {
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

async function pageMasterRowDetail(request, env, user, code, id) {
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

async function pageMasterSetup(request, env, user) {
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

async function handleMasterSetCreate(request, env, user) {
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

async function handleMasterSetUpdate(request, env, user, code) {
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

async function pageMasterSetDetail(request, env, user, code) {
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

async function handleMasterFieldCreate(request, env, user, code) {
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

async function pageMasterFieldDetail(request, env, user, code, fieldId) {
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

async function handleMasterFieldUpdate(request, env, user, code, fieldId) {
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

async function handleMasterFieldDelete(request, env, user, code, fieldId) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const set = await loadMasterSet(env, code);
  if (set) await env.DB.prepare(`DELETE FROM tech_master_field WHERE id = ? AND set_id = ?`).bind(fieldId, set.id).run();
  return redirect(`/master/setup/${code}`);
}

// 인접한 필드와 sort_order 를 맞바꾼다. handleDailyFieldMove와 같은 방식이며 set_id로 스코프만 좁혔다.
async function handleMasterFieldMove(request, env, user, code, fieldId) {
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

// #region 라우팅 테이블 (export default { fetch })

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const requestL = t(getLang(request));

    try {
      if (!isSameOriginMutation(request)) return plainText(requestL.forbidden, 403);

      if (path === "/api/version" && method === "GET") {
        const metadata = env.CF_VERSION_METADATA;
        return new Response(JSON.stringify({ version: appPackage.version, deploymentId: metadata?.id || null, createdAt: metadata?.timestamp || null }), {
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
        });
      }

      if (path === "/setup") {
        if (method === "GET") return pageSetup(request, env, null);
        if (method === "POST") return handleSetupPost(request, env);
      }

      if (path === "/login") {
        if (method === "GET") return pageLogin(request, env, null);
        if (method === "POST") return handleLoginPost(request, env);
      }

      if (path === "/logout" && method === "POST") return handleLogout(request, env);
      if (path === "/logout") return plainText(requestL.methodNotAllowed, 405);

      if (path === "/signup") {
        if (method === "GET") return pageSignup(request, env, null, null);
        if (method === "POST") return handleSignupPost(request, env);
      }

      if (path === "/verify-email" && method === "GET") return handleVerifyEmail(request, env);

      if (path === "/resend-verification") {
        if (method === "GET") return pageResendVerification(request, env, null, null);
        if (method === "POST") return handleResendVerificationPost(request, env);
      }

      if (path === "/forgot-password") {
        if (method === "GET") return pageForgotPassword(request, env, null, null);
        if (method === "POST") return handleForgotPasswordPost(request, env);
      }

      if (path === "/reset-password") {
        if (method === "GET") return pageResetPassword(request, env, null);
        if (method === "POST") return handleResetPasswordPost(request, env);
      }

      const langMatch = path.match(/^\/lang\/(ko|en|vi)$/);
      if (langMatch && method === "GET") return handleLangSwitch(request, langMatch[1]);

      // 이 아래는 전부 로그인 필요
      const user = await requireAuth(request, env);
      if (!user) {
        if (path.startsWith("/api/")) return json({ error: requestL.forbidden }, 401);
        return redirect("/login");
      }

      if (path === "/api/user/change-password" && method === "POST") {
        return handleChangePassword(request, env, user);
      }

      if (path.startsWith("/api/evaluation/")) return handleEvaluationApi(request, env, user);
      if (path.startsWith("/evaluation/") && method === "GET") return evaluationAsset(request);

      if (path === "/" && method === "GET") return redirect("/daily-reports");
      if (path === "/tasks" && method === "GET") return pageEvaluation(request, user);
      if (path === "/tasks/legacy" && method === "GET") return pageDashboard(request, env, user);
      if (path === "/daily-reports" && method === "GET") return pageDailyReports(request, env, user);
      if (path === "/daily-fields/export" && method === "GET") return fieldTransfer(request, env, user, true);
      if (path === "/daily-fields/import" && ["GET", "POST"].includes(method)) return fieldTransfer(request, env, user, false);
      if (path === "/daily-items" && method === "GET") return pageDailyItems(request, env, user);
      if (path === "/full-analysis-reports" && method === "GET") return pageMenuPlaceholder(request, user, "full-analysis");
      if (path === "/master-data-status" && method === "GET") return redirect("/master");
      if (path === "/master" && method === "GET") return pageMasterIndex(request, env, user);
      if (path === "/master/setup" && method === "GET") return pageMasterSetup(request, env, user);
      if (path === "/master/setup/new" && method === "POST") return handleMasterSetCreate(request, env, user);

      const masterSetDetailMatch = path.match(/^\/master\/setup\/([A-Z][A-Z0-9_]*)$/);
      if (masterSetDetailMatch && method === "GET") return pageMasterSetDetail(request, env, user, masterSetDetailMatch[1]);
      if (masterSetDetailMatch && method === "POST") return handleMasterSetUpdate(request, env, user, masterSetDetailMatch[1]);

      const masterFieldNewMatch = path.match(/^\/master\/setup\/([A-Z][A-Z0-9_]*)\/fields\/new$/);
      if (masterFieldNewMatch && method === "POST") return handleMasterFieldCreate(request, env, user, masterFieldNewMatch[1]);

      const masterFieldDetailMatch = path.match(/^\/master\/setup\/([A-Z][A-Z0-9_]*)\/fields\/(\d+)$/);
      if (masterFieldDetailMatch && method === "GET") return pageMasterFieldDetail(request, env, user, masterFieldDetailMatch[1], masterFieldDetailMatch[2]);
      if (masterFieldDetailMatch && method === "POST") return handleMasterFieldUpdate(request, env, user, masterFieldDetailMatch[1], masterFieldDetailMatch[2]);

      const masterFieldDeleteMatch = path.match(/^\/master\/setup\/([A-Z][A-Z0-9_]*)\/fields\/(\d+)\/delete$/);
      if (masterFieldDeleteMatch && method === "POST") return handleMasterFieldDelete(request, env, user, masterFieldDeleteMatch[1], masterFieldDeleteMatch[2]);

      const masterFieldMoveMatch = path.match(/^\/master\/setup\/([A-Z][A-Z0-9_]*)\/fields\/(\d+)\/move$/);
      if (masterFieldMoveMatch && method === "POST") return handleMasterFieldMove(request, env, user, masterFieldMoveMatch[1], masterFieldMoveMatch[2]);

      const masterRowDetailMatch = path.match(/^\/master\/([A-Z][A-Z0-9_]*)\/row\/(\d+)$/);
      if (masterRowDetailMatch && method === "GET") return pageMasterRowDetail(request, env, user, masterRowDetailMatch[1], masterRowDetailMatch[2]);

      const masterListMatch = path.match(/^\/master\/([A-Z][A-Z0-9_]*)$/);
      if (masterListMatch && method === "GET") return pageMasterList(request, env, user, masterListMatch[1]);
      if (path === "/admin/users" && method === "GET") return pageUserApprovals(request, env, user);

      const memberAccountMatch = path.match(/^\/admin\/users\/(\d+)\/(edit|delete)$/);
      if (memberAccountMatch && (method === "GET" || method === "POST")) return await handleMemberAccount(request, env, user, memberAccountMatch[1], memberAccountMatch[2]);

      const userApproveMatch = path.match(/^\/admin\/users\/(\d+)\/approve$/);
      if (userApproveMatch && method === "POST") return handleUserApprove(request, env, user, userApproveMatch[1]);

      const userPasswordResetMatch = path.match(/^\/admin\/users\/(\d+)\/password-reset$/);
      if (userPasswordResetMatch && method === "POST") return handleUserPasswordReset(request, env, user, userPasswordResetMatch[1]);

      const userPromoteMatch = path.match(/^\/admin\/users\/(\d+)\/promote$/);
      if (userPromoteMatch && method === "POST") return handleUserPromote(request, env, user, userPromoteMatch[1]);

      const userDemoteMatch = path.match(/^\/admin\/users\/(\d+)\/demote$/);
      if (userDemoteMatch && method === "POST") return handleUserDemote(request, env, user, userDemoteMatch[1]);

      const userRevokeMatch = path.match(/^\/admin\/users\/(\d+)\/revoke$/);
      if (userRevokeMatch && method === "POST") return handleUserRevoke(request, env, user, userRevokeMatch[1]);

      if (path === "/api/lot-info" && method === "GET") {
        const lang = getLang(request);
        return await handleLotInfoApi(request, env, lang);
      }
      if (path === "/lot-tracker" && ["GET", "POST"].includes(method)) {
        const lang = getLang(request);
        return await handleLotTracker(request, env, user, { lang, esc: escapeHtml,
          render: (body, status = 200) => html(layout({ title: "LOT Tracker", user, lang, activeNav: "daily", mainClass: "daily-work-page", body: dailyWorkSubtabs(t(lang), "tracker", user) + body }), status) });
      }
      const managedDailyField = path.match(/^\/daily-fields\/(\d+)(?:\/|$)/);
      if (managedDailyField && user.role === "admin") {
        const allFields = (await loadDailyFields(env, true)).fields;
        const field = allFields.find(f => String(f.id) === managedDailyField[1]);
        if (hasDailyClassification(allFields) && field && (RETIRED_DAILY_FIELDS.has(field.label) || (field.label === "LOTID" && method !== "GET" && !path.endsWith("/move")))) return plainText(requestL.notFoundPlain, 404);
      }
      if (path === "/daily-items/new" && method === "POST") return await handleDailyItemCreate(request, env, user);

      const dailyItemDetailMatch = path.match(/^\/daily-items\/(\d+)$/);
      if (dailyItemDetailMatch && method === "GET") return pageDailyItemDetail(request, env, user, dailyItemDetailMatch[1]);

      const dailyItemUpdateMatch = path.match(/^\/daily-items\/(\d+)\/updates$/);
      if (dailyItemUpdateMatch && method === "POST") return await handleDailyItemAddUpdate(request, env, user, dailyItemUpdateMatch[1]);

      const dailyItemCloseMatch = path.match(/^\/daily-items\/(\d+)\/close$/);
      if (dailyItemCloseMatch && method === "POST") return handleDailyItemClose(request, env, user, dailyItemCloseMatch[1]);

      const dailyItemDeleteMatch = path.match(/^\/daily-items\/(\d+)\/delete$/);
      if (dailyItemDeleteMatch && method === "POST") return handleDailyItemDelete(request, env, user, dailyItemDeleteMatch[1]);

      const dailyUpdateDeleteMatch = path.match(/^\/daily-items\/(\d+)\/updates\/(\d+)\/delete$/);
      if (dailyUpdateDeleteMatch && method === "POST") return handleDailyItemDelete(request, env, user, dailyUpdateDeleteMatch[1], dailyUpdateDeleteMatch[2]);

      if (path === "/daily-fields" && method === "GET") return pageDailyFields(request, env, user);
      if (path === "/daily-fields/apply-standard" && method === "POST") return handleDailyFieldTemplateApply(request, env, user);
      if (path === "/daily-fields/new" && method === "POST") return handleDailyFieldCreate(request, env, user);

      const dailyFieldDetailMatch = path.match(/^\/daily-fields\/(\d+)$/);
      if (dailyFieldDetailMatch && method === "GET") return pageDailyFieldDetail(request, env, user, dailyFieldDetailMatch[1]);
      if (dailyFieldDetailMatch && method === "POST") return handleDailyFieldUpdate(request, env, user, dailyFieldDetailMatch[1]);

      const dailyFieldDeleteMatch = path.match(/^\/daily-fields\/(\d+)\/delete$/);
      if (dailyFieldDeleteMatch && method === "POST") return handleDailyFieldDelete(request, env, user, dailyFieldDeleteMatch[1]);

      const dailyFieldMoveMatch = path.match(/^\/daily-fields\/(\d+)\/move$/);
      if (dailyFieldMoveMatch && method === "POST") return handleDailyFieldMove(request, env, user, dailyFieldMoveMatch[1]);

      const dailyFieldOptionNewMatch = path.match(/^\/daily-fields\/(\d+)\/options\/new$/);
      if (dailyFieldOptionNewMatch && method === "POST") return handleDailyFieldOptionCreate(request, env, user, dailyFieldOptionNewMatch[1]);

      const dailyFieldOptionDeleteMatch = path.match(/^\/daily-fields\/(\d+)\/options\/(\d+)\/delete$/);
      if (dailyFieldOptionDeleteMatch && method === "POST") return handleDailyFieldOptionDelete(request, env, user, dailyFieldOptionDeleteMatch[1], dailyFieldOptionDeleteMatch[2]);

      const dailyFieldOptionImportMatch = path.match(/^\/daily-fields\/(\d+)\/options\/import$/);
      if (dailyFieldOptionImportMatch && method === "POST") return handleDailyFieldOptionImport(request, env, user, dailyFieldOptionImportMatch[1]);

      if (path === "/tasks/new" && method === "POST") return handleTaskCreate(request, env, user);

      const taskDetailMatch = path.match(/^\/tasks\/(\d+)$/);
      if (taskDetailMatch && method === "GET") return pageTaskDetail(request, env, user, taskDetailMatch[1]);

      const taskUpdateMatch = path.match(/^\/tasks\/(\d+)\/update$/);
      if (taskUpdateMatch && method === "POST") return handleTaskUpdateStatus(request, env, user, taskUpdateMatch[1]);

      const taskAddUpdateMatch = path.match(/^\/tasks\/(\d+)\/updates$/);
      if (taskAddUpdateMatch && method === "POST") return handleTaskAddUpdate(request, env, user, taskAddUpdateMatch[1]);

      if (path === "/api/tasks" && method === "GET") return apiListTasks(request, env);
      if (path === "/api/product-match" && method === "GET") return apiProductMatch(request, env);
      if (path === "/api/reports" && method === "GET") return apiListReports(request, env);
      if (path === "/api/reports" && method === "POST") return apiCreateReport(request, env, user);

      return plainText(requestL.notFoundPlain, 404);
    } catch (err) {
      console.error("Unhandled request error", {
        method,
        path,
        message: err && err.message ? err.message : String(err),
        stack: err && err.stack ? err.stack : undefined,
      });
      return plainText(requestL.internalServerError, 500);
    }
  },
};

// #endregion
