/**
 * Layout · Sidebar · Subtabs
 *
 * Export: langSwitcher, layout, dailyWorkSubtabs
 *
 * Phụ thuộc:
 *  - escapeHtml, html    ← từ ../utils/helpers.js
 *  - LANGS, LANG_NAMES, t ← từ ../../i18n.js
 *  - appPackage           ← từ ../../package.json
 */

import { escapeHtml, html } from "../utils/helpers.js";
import { LANGS, LANG_NAMES, t, getLang } from "../i18n/index.js";
import appPackage from "../../package.json" with { type: "json" };

export function langSwitcher(lang) {
  const links = LANGS.map((code) => {
    const label = LANG_NAMES[code];
    return code === lang
      ? `<span class="lang-current">${label}</span>`
      : `<a href="/lang/${code}">${label}</a>`;
  }).join(`<span class="muted"> · </span>`);
  return `<span class="lang-switcher" style="font-size:14px;">${links}</span>`;
}

export function layout({ title, user, lang, body, activeNav, activeSubNav = "", mainClass = "" }) {
  const L = t(lang);
  const versionLabels = L.versionLabels;
  const icon = (paths, size = 18) => `<svg class="nav-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const navItem = (href, key, label, paths) => `<a href="${href}" class="${activeNav === key ? "active" : ""}">${icon(paths)}<span>${escapeHtml(label)}</span></a>`;
  const taskMenuLabels = L.taskMenuLabels;
  const legacyTaskLabel = L.legacyTaskLabel;
  const taskSubNav = activeNav === "tasks" ? `<div class="sidebar-subnav">
    ${Object.entries(taskMenuLabels).filter(([key]) => key !== "users" || user?.role === "admin").map(([key,label]) => `<a href="/tasks?section=${key}" class="${activeSubNav === key ? "active" : ""}">${escapeHtml(label)}</a>`).join("")}
    <a href="/tasks/legacy" class="sidebar-subnav-legacy ${activeSubNav === "legacy" ? "active" : ""}">${escapeHtml(legacyTaskLabel)}</a>
  </div>` : "";
  return `<!doctype html>
<html lang="${lang}" translate="no"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="google" content="notranslate">
<title>${escapeHtml(title)} · ${escapeHtml(L.appTitle)}</title>
<style>
  :root {
    color-scheme: light dark;
    --sidebar-w:232px; --header-h:64px;
    --bg:#f8fafc; --surface:#ffffff; --surface-2:#f8fafc; --surface-hover:#f1f5f9;
    --border:#e2e8f0; --border-strong:#cbd5e1;
    --text:#1e293b; --heading:#0f172a; --muted:#64748b;
    --accent:#4f46e5; --accent-hover:#4338ca; --accent-soft:#eef2ff; --accent-soft-text:#4338ca;
    --link:#4f46e5; --link-hover:#3730a3; --ring:rgba(99,102,241,.28);
    --input-bg:#ffffff; --header-bg:rgba(255,255,255,.94);
    --danger:#dc2626; --danger-hover:#b91c1c; --danger-text:#dc2626;
    --pill-bg:#f1f5f9; --pill-text:#334155;
    --ok-bg:#d1fae5; --ok-text:#065f46; --ok-soft:#ecfdf5; --ok-border:#a7f3d0;
    --warn-bg:#fef3c7; --warn-text:#92400e; --warn-soft:#fffbeb; --warn-border:#fde68a;
    --bad-bg:#fee2e2; --bad-text:#991b1b; --bad-soft:#fef2f2; --bad-border:#fecaca;
    --info-bg:#e0e7ff; --info-text:#3730a3;
    --side-bg:#0f172a; --side-border:#1e293b; --side-text:#94a3b8; --side-hover:#1e293b; --side-strong:#ffffff; --side-muted:#64748b;
    --shadow-sm:0 1px 2px rgba(15,23,42,.05);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#0a0f1c; --surface:#131c30; --surface-2:#0f1728; --surface-hover:#1a2540;
      --border:#243150; --border-strong:#3a4a66;
      --text:#e2e8f0; --heading:#f8fafc; --muted:#94a3b8;
      --accent:#6366f1; --accent-hover:#818cf8; --accent-soft:rgba(99,102,241,.18); --accent-soft-text:#c7d2fe;
      --link:#a5b4fc; --link-hover:#c7d2fe; --ring:rgba(129,140,248,.35);
      --input-bg:#0a0f1c; --header-bg:rgba(10,15,28,.92);
      --danger:#dc2626; --danger-hover:#ef4444; --danger-text:#fca5a5;
      --pill-bg:#1e293b; --pill-text:#cbd5e1;
      --ok-bg:rgba(16,185,129,.18); --ok-text:#6ee7b7; --ok-soft:rgba(16,185,129,.08); --ok-border:rgba(16,185,129,.35);
      --warn-bg:rgba(245,158,11,.18); --warn-text:#fcd34d; --warn-soft:rgba(245,158,11,.08); --warn-border:rgba(245,158,11,.35);
      --bad-bg:rgba(239,68,68,.18); --bad-text:#fca5a5; --bad-soft:rgba(239,68,68,.08); --bad-border:rgba(239,68,68,.35);
      --info-bg:rgba(99,102,241,.2); --info-text:#c7d2fe;
      --side-bg:#020617; --side-hover:#111a2e;
      --shadow-sm:0 1px 2px rgba(0,0,0,.3);
    }
  }
  * { box-sizing: border-box; }
  html, body { height:100%; }
  body { font-family: Pretendard, "Pretendard Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; font-size:15px; line-height:1.5; margin:0; background:var(--bg); color:var(--text); -webkit-font-smoothing:antialiased; }
  h1, h2, h3, h4 { color:var(--heading); letter-spacing:-.01em; }
  h2 { font-size:22px; font-weight:700; }
  h3 { font-size:17px; font-weight:600; }
  a { color:var(--link); text-decoration:none; }
  a:hover { color:var(--link-hover); text-decoration:underline; text-underline-offset:2px; }
  hr { border:0; border-top:1px solid var(--border); }
  summary { cursor:pointer; }
  .shell { display:flex; min-height:100vh; }
  .shell::after { content:""; position:fixed; top:0; left:var(--sidebar-w); right:0; height:var(--header-h); background:var(--header-bg); border-bottom:1px solid var(--border); z-index:15; backdrop-filter:blur(6px); }
  .sidebar { width:var(--sidebar-w); flex:0 0 var(--sidebar-w); position:sticky; top:0; height:100vh; align-self:flex-start; background:var(--side-bg); color:var(--side-text); border-right:1px solid var(--side-border); display:flex; flex-direction:column; }
  .sidebar-top { height:var(--header-h); display:flex; align-items:center; gap:10px; padding:0 20px; border-bottom:1px solid var(--side-border); }
  .brand-mark { flex:0 0 auto; display:inline-flex; color:#818cf8; }
  .sidebar-top h1 { font-size:16px; font-weight:700; margin:0; line-height:1.3; color:var(--side-strong); }
  .sidebar-nav { display:flex; flex-direction:column; padding:14px 12px; gap:4px; flex:1; overflow-y:auto; }
  .sidebar-nav a { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:8px; color:var(--side-text); text-decoration:none; font-size:14px; font-weight:500; transition:background .15s, color .15s; }
  .sidebar-nav a:hover { background:var(--side-hover); color:var(--side-strong); text-decoration:none; }
  .sidebar-nav a.active { background:var(--accent); color:#fff; font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,.25); }
  .nav-icon { flex:0 0 auto; }
  .lang-switcher a { color:var(--muted); text-decoration:none; }
  .lang-switcher a:hover { color:var(--text); text-decoration:none; }
  .lang-current { color:var(--heading); font-weight:600; }
  .page-tools { position:fixed; top:14px; right:20px; z-index:20; display:flex; align-items:center; justify-content:flex-end; gap:10px; height:36px; padding:0 4px; color:var(--text); white-space:nowrap; font-size:14px; }
  .sidebar-subnav { display:flex; flex-direction:column; gap:2px; padding:2px 0 7px 12px; }
  .sidebar-subnav a { padding:7px 10px; font-size:12px; border-radius:6px; }
  .sidebar-subnav a.active { background:var(--side-hover); color:var(--side-strong); box-shadow:none; }
  .sidebar-subnav a.sidebar-subnav-legacy { margin-top:4px; border-top:1px solid var(--side-border); border-radius:0 0 6px 6px; color:var(--side-muted); }
  .page-tools .lang-switcher, .page-tools .account-info, .page-tools form { display:inline-flex; align-items:center; margin:0; font-size:14px; }
  .page-tools .account-info { font-weight:500; }
  .page-tools .tool-divider { color:var(--border-strong); }
  .page-tools .logout-button { padding:0; border:0; border-radius:0; background:transparent; color:var(--muted); font:inherit; box-shadow:none; }
  .page-tools .logout-button:hover { color:var(--danger-text); background:transparent; }
  /* User profile dropdown popover & modal */
  .user-menu-container { position:relative; display:inline-flex; }
  .user-menu-btn { display:inline-flex; align-items:center; gap:8px; padding:4px 12px 4px 6px; border:1px solid var(--border-strong); border-radius:999px; background:var(--surface); color:var(--text); font-size:13.5px; font-weight:500; cursor:pointer; box-shadow:var(--shadow-sm); transition:border-color .15s, background .15s; }
  .user-menu-btn:hover { background:var(--surface-hover); border-color:var(--accent); }
  .user-menu-avatar { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:var(--accent); color:#fff; font-weight:700; font-size:13px; }
  .user-profile-popover { position:absolute; top:calc(100% + 8px); right:0; width:290px; background:var(--surface); border:1px solid var(--border); border-radius:12px; box-shadow:0 10px 25px -5px rgba(0,0,0,.18), 0 8px 10px -6px rgba(0,0,0,.1); z-index:100; overflow:hidden; font-size:13.5px; text-align:left; }
  .user-popover-header { padding:18px 16px 14px; background:linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color:#fff; text-align:center; }
  .user-popover-avatar { display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,.18); color:#fff; margin:0 auto 8px; }
  .user-popover-name { font-weight:700; font-size:15px; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .user-popover-role { font-size:11px; padding:2px 7px; border-radius:999px; background:rgba(255,255,255,.2); font-weight:600; vertical-align:middle; }
  .user-popover-email { font-size:12px; color:#cbd5e1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .user-popover-body { padding:8px 6px; }
  .popover-item { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:8px; color:var(--text); cursor:pointer; font-weight:500; transition:background .15s; }
  .popover-item:hover { background:var(--surface-hover); color:var(--heading); }
  .popover-section-label { display:flex; align-items:center; gap:8px; padding:10px 12px 4px; font-size:11.5px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.03em; }
  .user-lang-chips { display:flex; gap:6px; padding:4px 10px 6px; }
  .lang-chip { flex:1; text-align:center; padding:5px 4px; font-size:12px; font-weight:600; border:1px solid var(--border-strong); border-radius:6px; background:var(--surface-2); color:var(--muted); text-decoration:none; transition:all .15s; }
  .lang-chip:hover { border-color:var(--accent); color:var(--text); text-decoration:none; }
  .lang-chip.active { background:var(--accent-soft); border-color:var(--accent); color:var(--accent-soft-text); }
  .popover-divider { height:1px; background:var(--border); margin:6px 0; }
  .popover-logout-form { margin:0; }
  .popover-logout-btn { display:flex; align-items:center; gap:10px; width:100%; padding:9px 12px; border-radius:8px; color:var(--danger-text); font-weight:600; cursor:pointer; background:transparent; border:none; transition:background .15s; font-size:13.5px; text-align:left; }
  .popover-logout-btn:hover { background:var(--bad-soft); }
  .modal-backdrop { position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,.5); z-index:1000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(3px); }
  .modal-card { width:90%; max-width:400px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:22px 24px; box-shadow:0 20px 25px -5px rgba(0,0,0,.2); }
  .modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
  .modal-header h3 { margin:0; font-size:17px; }
  .modal-close-btn { background:transparent; border:none; font-size:22px; cursor:pointer; color:var(--muted); padding:0 4px; }
  .modal-close-btn:hover { color:var(--text); }
  .modal-msg { padding:8px 12px; border-radius:6px; font-size:13px; margin-bottom:10px; }
  .modal-msg.is-ok { background:var(--ok-soft); border:1px solid var(--ok-border); color:var(--ok-text); }
  .modal-msg.is-bad { background:var(--bad-soft); border:1px solid var(--bad-border); color:var(--bad-text); }
  .modal-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
  main { flex:1; min-width:0; width:calc(100vw - var(--sidebar-w)); max-width:none; padding:24px 28px 60px; }
  main::before { content:""; display:block; height:var(--header-h); }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px 22px; margin-bottom:18px; box-shadow:var(--shadow-sm); }
  label { display:block; font-size:13px; font-weight:500; color:var(--text); margin:12px 0 6px; }
  input, select, textarea { width:100%; padding:9px 11px; border-radius:8px; border:1px solid var(--border-strong); background:var(--input-bg); color:var(--text); font:inherit; font-size:15px; accent-color:var(--accent); transition:border-color .15s, box-shadow .15s; }
  input:focus, select:focus, textarea:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--ring); }
  input[readonly], textarea[readonly], input:disabled, select:disabled, textarea:disabled { background:var(--surface-2); color:var(--muted); }
  input::placeholder, textarea::placeholder { color:var(--muted); opacity:.8; }
  textarea { min-height:70px; resize:vertical; }
  button { cursor:pointer; border:1px solid transparent; border-radius:8px; padding:9px 16px; font:inherit; font-size:14px; font-weight:600; background:var(--accent); color:#fff; box-shadow:var(--shadow-sm); transition:background .15s, border-color .15s, box-shadow .15s; }
  button:hover { background:var(--accent-hover); }
  button:focus-visible { outline:none; box-shadow:0 0 0 3px var(--ring); }
  button:disabled { opacity:.55; cursor:not-allowed; pointer-events:none; }
  button.secondary { background:var(--surface); color:var(--text); border-color:var(--border-strong); }
  button.secondary:hover { background:var(--surface-hover); }
  button.danger { background:var(--danger); color:#fff; }
  button.danger:hover { background:var(--danger-hover); }
  button.small { padding:4px 10px; font-size:12.5px; border-radius:6px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:9px 8px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { background:var(--surface-2); color:var(--muted); font-weight:600; }
  tbody tr:hover > td { background:var(--surface-hover); }
  .badge { display:inline-block; padding:2px 10px; border-radius:999px; font-size:12.5px; font-weight:600; background:var(--pill-bg); color:var(--pill-text); }
  .b-검토중 { background:var(--info-bg); color:var(--info-text); }
  .b-조치중 { background:var(--warn-bg); color:var(--warn-text); }
  .b-완료 { background:var(--ok-bg); color:var(--ok-text); }
  .b-보류 { background:var(--bad-bg); color:var(--bad-text); }
  .err { color:var(--danger-text); font-size:14px; margin-top:8px; }
  .muted { color:var(--muted); font-size:14px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; }
  .row > * { flex:1; min-width:140px; }
  form.inline { display:inline; }
  .subtabs { display:flex; flex-wrap:wrap; gap:4px; width:fit-content; max-width:100%; margin-bottom:18px; padding:4px; background:var(--surface); border:1px solid var(--border); border-radius:10px; box-shadow:var(--shadow-sm); }
  .subtabs a { padding:7px 14px; border-radius:7px; text-decoration:none; color:var(--muted); font-size:14px; font-weight:500; }
  .subtabs a:hover { color:var(--text); background:var(--surface-hover); text-decoration:none; }
  .subtabs a.active { background:var(--accent-soft); color:var(--accent-soft-text); font-weight:600; }
  .stat-tile { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; box-shadow:var(--shadow-sm); }
  .stat-tile.warn { border-color:var(--warn-border); background:var(--warn-soft); }
  .stat-tile.good { border-color:var(--ok-border); background:var(--ok-soft); }
  .stat-tile.danger { border-color:var(--bad-border); background:var(--bad-soft); }
  .stat-value { font-size:26px; font-weight:700; line-height:1.2; color:var(--heading); }
  .stat-label { font-size:13px; color:var(--muted); margin-top:2px; }
  .status-pill { display:inline-block; padding:3px 10px; border-radius:999px; font-size:12.5px; font-weight:600; background:var(--pill-bg); color:var(--pill-text); }
  .status-pill.issue { background:var(--bad-bg); color:var(--bad-text); }
  .status-pill.done { background:var(--ok-bg); color:var(--ok-text); }
  main.daily-work-page { padding:14px 14px 36px; font-size:14px; }
  .daily-work-page h2 { font-size:20px; line-height:1.25; }
  .daily-work-page h3 { font-size:16px; line-height:1.3; }
  .daily-work-page p { margin:7px 0; }
  .daily-work-page .card { padding:11px 14px; margin-bottom:10px; border-radius:8px; }
  .daily-work-page .card > :first-child { margin-top:0; }
  .daily-work-page .card > :last-child { margin-bottom:0; }
  .daily-work-page label { font-size:12px; margin:5px 0 3px; }
  .daily-work-page input, .daily-work-page select, .daily-work-page textarea { padding:6px 8px; font-size:14px; }
  .daily-work-page textarea { min-height:58px; }
  .daily-work-page button { padding:6px 11px; font-size:13px; }
  .daily-work-page table { font-size:13px; }
  .daily-work-page th, .daily-work-page td { padding:5px 4px; }
  .daily-work-page .muted { font-size:12px; }
  .daily-work-page .row { gap:8px; }
  .daily-work-page .subtabs { gap:4px; margin-bottom:10px; }
  .daily-work-page .subtabs a { padding:5px 10px; font-size:13px; }
  .daily-work-page .stat-tile { padding:10px 12px; }
  .daily-work-page .stat-value { font-size:20px; }
  .daily-work-page .stat-label, .daily-work-page .status-pill { font-size:12px; }
  @media (min-width: 681px) {
    /* 일일업무 입력 폼의 필드는 개수·길이가 관리자 설정에 따라 달라지므로, 화면 폭을
       그대로 채우지 않고 각 입력칸이 실제 내용 길이에 맞게 좁아지도록 한다(2026-09-16).
       select는 폭을 지정하지 않으면 브라우저가 선택지 중 가장 긴 값에 맞춰 자동으로
       맞추므로 별도 계산이 필요 없다. text/date는 고정 상한, textarea만 조금 더 넓게 둔다. */
    .field-grid { display:flex; flex-wrap:wrap; gap:10px 16px; }
    .field-grid > div { display:flex; flex-direction:column; }
    .field-grid select { width:auto; }
    .field-grid input { width:auto; min-width:100px; max-width:220px; }
    .field-grid textarea { width:100%; max-width:420px; }
  }
  .report-table-wrap { width:100%; overflow:visible; }
  .report-table { width:100%; min-width:0; table-layout:fixed; font-size:clamp(10px, calc(.64vw + 2px), 12px); }
  .report-table th, .report-table td { padding:4px 3px; overflow-wrap:anywhere; word-break:break-word; }
  .live-report-table th:nth-child(1), .live-report-table td:nth-child(1) { width:7%; }
  .live-report-table th:nth-child(2), .live-report-table td:nth-child(2) { width:7%; }
  .live-report-table th:nth-child(3), .live-report-table td:nth-child(3) { width:12%; }
  .live-report-table th:nth-child(4), .live-report-table td:nth-child(4) { width:8%; }
  .live-report-table th:nth-child(5), .live-report-table td:nth-child(5) { width:8%; }
  .live-report-table th:nth-child(6), .live-report-table td:nth-child(6) { width:8%; }
  .live-report-table th:nth-child(7), .live-report-table td:nth-child(7),
  .live-report-table th:nth-child(8), .live-report-table td:nth-child(8),
  .live-report-table th:nth-child(9), .live-report-table td:nth-child(9),
  .live-report-table th:nth-child(10), .live-report-table td:nth-child(10) { width:5%; }
  .live-report-table th:nth-child(11), .live-report-table td:nth-child(11) { width:7%; }
  .live-report-table th:nth-child(12), .live-report-table td:nth-child(12) { width:15%; }
  .live-report-table th:nth-child(13), .live-report-table td:nth-child(13) { width:8%; }
  .archive-report-table th:nth-child(1), .archive-report-table td:nth-child(1) { width:11%; }
  .archive-report-table th:nth-child(2), .archive-report-table td:nth-child(2) { width:18%; }
  .archive-report-table th:nth-child(3), .archive-report-table td:nth-child(3) { width:23%; }
  .archive-report-table th:nth-child(4), .archive-report-table td:nth-child(4) { width:18%; }
  .archive-report-table th:nth-child(5), .archive-report-table td:nth-child(5),
  .archive-report-table th:nth-child(6), .archive-report-table td:nth-child(6),
  .archive-report-table th:nth-child(7), .archive-report-table td:nth-child(7) { width:10%; }
  @media print {
    @page { size:A4 landscape; margin:8mm; }
    :root { color-scheme:light; --bg:#fff; --surface:#fff; --surface-2:#f3f4f6; --surface-hover:#fff; --border:#ccc; --border-strong:#bbb; --text:#000; --heading:#000; --muted:#444; --shadow-sm:none;
      --pill-bg:#f1f5f9; --pill-text:#334155; --ok-bg:#d1fae5; --ok-text:#065f46; --bad-bg:#fee2e2; --bad-text:#991b1b;
      --warn-bg:#fef3c7; --warn-text:#92400e; --warn-soft:#fffbeb; --info-bg:#e0e7ff; --info-text:#3730a3; }
    .sidebar, .subtabs, .no-print, .shell::after, main::before { display:none !important; }
    .shell { display:block; }
    main { max-width:100%; padding:0; margin:0; }
    body { background:#fff; color:#000; }
    .card, .stat-tile { background:#fff; border:1px solid #ccc; color:#000; break-inside:avoid; }
    .report-table { min-width:0; width:100%; table-layout:fixed; font-size:10px; }
    .report-table th, .report-table td { padding:4px 3px; overflow-wrap:anywhere; }
    a { color:#000; }
    .muted { color:#444; }
  }
  @media (max-width: 680px) {
    .shell { flex-direction:column; }
    .shell::after, main::before { display:none; }
    .sidebar { width:100%; height:auto; position:static; flex:0 0 auto; flex-direction:row; align-items:center; flex-wrap:wrap; }
    .sidebar-top { height:auto; padding:14px 16px; border-bottom:none; border-right:1px solid var(--side-border); }
    .sidebar-nav { flex-direction:row; flex-wrap:wrap; padding:8px; }
    .sidebar-nav a { padding:8px 10px; gap:8px; }
    .sidebar-subnav { flex:0 0 100%; display:flex; flex-direction:row; flex-wrap:wrap; padding:0 4px 4px; }
    .sidebar-subnav a { flex:1 1 145px; }
    main { width:100%; padding:16px 12px 48px; }
    .page-tools { position:static; justify-content:flex-end; flex-wrap:wrap; margin-bottom:8px; padding:4px 0; border:0; background:transparent; }
    main.daily-work-page { padding:10px 8px 32px; }
    .report-table thead { display:none; }
    .report-table tbody { display:grid; gap:12px; }
    .report-table tr { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); padding:8px; border:1px solid var(--border); border-radius:10px; background:var(--surface); box-shadow:var(--shadow-sm); }
    .report-table td { display:grid; grid-template-columns:minmax(88px,38%) 1fr; gap:8px; width:auto !important; padding:5px 6px; border:0; font-size:14px; }
    .report-table td::before { content:attr(data-label); color:var(--muted); font-size:13px; font-weight:600; }
    .report-table td:nth-child(3), .report-table td:nth-child(12) { grid-column:1 / -1; }
  }
.site-version { margin-top:auto; padding:14px 20px; color:var(--side-muted); font-size:12px; border-top:1px solid var(--side-border); }
.site-version a { color:inherit; text-decoration:none; }
.site-version a:hover { color:var(--side-text); text-decoration:none; }
@media (max-width:680px) { .site-version { flex:0 0 100%; box-sizing:border-box; text-align:right; padding:8px 12px; } .site-version br { display:none; } .site-version span { margin-left:8px; } }
@media print { .site-version { display:none; } }

.daily-heading, .daily-overview-head { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.daily-heading { margin:6px 0 14px; }
.daily-heading h2, .daily-overview h4 { margin:0; }
.daily-heading p { margin:6px 0 0; }
.daily-primary { display:inline-block; padding:10px 16px; background:var(--accent); color:#fff; border-radius:8px; text-decoration:none; font-weight:600; box-shadow:var(--shadow-sm); }
.daily-primary:hover { background:var(--accent-hover); color:#fff; text-decoration:none; }
/* 일일보고 조회(2026-09-25): 조회 조건은 한 줄 도구막대, 파트는 머리띠가 있는 카드,
   보고 한 건은 상태색 띠가 있는 행으로 나눠 한눈에 구분되게 한다. 표시만 바꾼다. */
.daily-work-page .daily-toolbar { padding:10px 14px; }
.daily-filter { display:flex; flex-wrap:wrap; align-items:flex-end; gap:8px 12px; }
.daily-filter > div { display:flex; flex-direction:column; }
.daily-filter label { margin-top:0; color:var(--muted); font-weight:600; }
.daily-filter select { width:auto; min-width:180px; }
.daily-resultbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin:14px 2px 10px; }
.daily-resultbar p { margin:0; }
.daily-work-page .daily-part { padding:0 14px 4px; overflow:hidden; }
.daily-work-page .daily-part > .daily-part-head { display:flex; align-items:center; gap:8px; margin:0 -14px; padding:10px 14px; background:var(--surface-2); border-bottom:1px solid var(--border); }
.daily-part-head h3 { margin:0; }
.daily-count { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:22px; padding:0 7px; border-radius:999px; background:var(--accent-soft); color:var(--accent-soft-text); font-size:12px; font-weight:700; }
.daily-overview { position:relative; padding:14px 0 12px 14px; border-top:1px solid var(--border); }
.daily-part-head + .daily-overview { border-top:0; }
.daily-overview::before { content:""; position:absolute; left:0; top:14px; bottom:12px; width:3px; border-radius:3px; background:var(--border-strong); }
.daily-overview.is-issue::before { background:#ef4444; }
.daily-overview.is-done::before { background:#10b981; }
.daily-overview-head { align-items:flex-start; gap:6px 16px; }
.daily-overview-head > div { flex:1; min-width:180px; }
.daily-overview-head > .daily-overview-meta { flex:0 0 auto; min-width:0; display:flex; align-items:center; gap:10px; }
.daily-overview h4 { font-size:16px; margin-top:3px; }
.daily-overview h4 a { color:var(--heading); }
.daily-overview h4 a:hover { color:var(--link); }
.daily-content { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.65; margin:8px 0; }
.daily-issue { border-left:3px solid #f59e0b; padding:7px 12px; background:var(--warn-soft); border-radius:0 6px 6px 0; }
.daily-field-details summary, .daily-technical summary { color:var(--muted); cursor:pointer; padding:8px 0; }
.daily-field-details summary:hover, .daily-technical summary:hover { color:var(--text); }
.daily-field-details > summary, .daily-technical > summary, .daily-followup > summary, .lot-section > summary { list-style:none; display:inline-flex; align-items:center; gap:8px; }
.daily-field-details > summary::-webkit-details-marker, .daily-technical > summary::-webkit-details-marker, .daily-followup > summary::-webkit-details-marker, .lot-section > summary::-webkit-details-marker { display:none; }
.daily-field-details > summary::before, .daily-technical > summary::before, .daily-followup > summary::before, .lot-section > summary::before { content:""; width:6px; height:6px; border-right:2px solid currentColor; border-bottom:2px solid currentColor; transform:rotate(-45deg); transition:transform .15s; }
.daily-field-details[open] > summary::before, .daily-technical[open] > summary::before, .daily-followup[open] > summary::before, .lot-section[open] > summary::before { transform:rotate(45deg); }
.daily-field-details > summary, .daily-technical > summary, .lot-section > summary { margin:2px 0; padding:4px 11px; border:1px solid var(--border); border-radius:999px; background:var(--surface-2); font-size:12.5px; font-weight:500; }
.daily-field-details > summary:hover, .daily-technical > summary:hover, .lot-section > summary:hover { border-color:var(--border-strong); background:var(--surface-hover); }
.daily-part > .daily-technical { padding:10px 0 8px; border-top:1px solid var(--border); }
.daily-field-details dl { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin:8px 0 2px; padding:10px 12px; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; }
.daily-field-details dt { color:var(--muted); font-size:12px; }
.daily-field-details dd { margin:4px 0 0; white-space:pre-wrap; overflow-wrap:anywhere; }
.daily-followup summary { cursor:pointer; font-weight:600; padding:4px 0; }
.daily-followup[open] > summary { margin-bottom:14px; }
.daily-empty { text-align:center; padding:36px 16px !important; }
.daily-followup .status-pill { white-space:nowrap; }
/* 일일업무 입력·상세(2026-10-03): 조회 화면과 같은 머리띠 카드·도구막대·상태 배지를 쓴다.
   접이식 카드는 제목줄 전체가 눌리는 머리띠가 되고, 펼치면 아래와 선으로 나뉜다. */
.daily-work-page .card.daily-followup { overflow:hidden; }
.daily-work-page .card.daily-followup > summary { display:flex; margin:-11px -14px; padding:11px 14px; }
.daily-work-page .card.daily-followup[open] > summary { margin-bottom:12px; background:var(--surface-2); border-bottom:1px solid var(--border); }
.daily-work-page .card.daily-followup > summary:hover { background:var(--surface-hover); }
.daily-new > summary { color:var(--link); }
.daily-filter label > select { display:block; margin-top:3px; font-weight:400; font-size:14px; }
.daily-filter label:has(> select) { margin-bottom:0; }
.daily-form label { color:var(--muted); font-weight:600; }
.daily-form-actions { display:flex; align-items:center; gap:8px; margin-top:12px; padding:12px 0 10px; border-top:1px solid var(--border); }
.daily-work-page .daily-list { padding-bottom:0; }
.daily-list > .daily-filter { padding:10px 0; }
.daily-work-page .daily-item-table { width:calc(100% + 28px); margin:0 -14px; }
.daily-work-page .daily-item-table th, .daily-work-page .daily-item-table td { padding:8px 10px; vertical-align:middle; }
.daily-work-page .daily-item-table th { font-size:12px; border-top:1px solid var(--border); }
.daily-work-page .daily-item-table th:first-child, .daily-work-page .daily-item-table td:first-child { padding-left:14px; }
.daily-work-page .daily-item-table th:last-child, .daily-work-page .daily-item-table td:last-child { padding-right:14px; }
.daily-item-table tbody tr:last-child > td { border-bottom:0; }
.daily-item-table td a { font-weight:600; }
.daily-back { margin:2px 0 10px; }
.daily-item-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px 20px; flex-wrap:wrap; border-left:3px solid var(--accent); }
.daily-item-head.is-closed { border-left-color:var(--border-strong); }
.daily-item-title { flex:1; min-width:220px; }
.daily-item-title h2 { margin:0; }
.daily-item-title p { margin:6px 0 0; }
.daily-work-page .daily-closed-note { display:inline-block; padding:2px 10px; border-radius:999px; background:var(--warn-bg); color:var(--warn-text); font-weight:600; }
.daily-item-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.daily-item-actions form { margin:0; }
.daily-item-actions button { padding:6px 12px; font-size:13px; border-radius:8px; }
.daily-part > p.muted { margin:10px 0 2px; }
.daily-work-page .daily-part > p.muted:last-child { margin-bottom:10px; }
.daily-history-entry { position:relative; padding:12px 0 12px 18px; border-top:1px solid var(--border); }
.daily-part-head + .daily-history-entry { border-top:0; }
.daily-history-entry::before { content:""; position:absolute; left:1px; top:18px; width:8px; height:8px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
.daily-history-meta { color:var(--heading); font-weight:600; font-size:13px; margin-bottom:6px; }
.daily-history-lines { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:4px 18px; }
.daily-work-page .daily-history-lines > .muted { color:var(--text); font-size:13px; overflow-wrap:anywhere; }
.daily-history-entry form { margin-top:8px; }
/* 기준정보(2026-10-04): 같은 머리글·도구막대·머리띠 카드에 종류 카드, 정렬 표, 쪽 넘김을 더한다. */
.daily-secondary { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border:1px solid var(--border-strong); border-radius:8px; background:var(--surface); color:var(--text); font-size:13px; font-weight:600; box-shadow:var(--shadow-sm); }
.daily-secondary:hover { background:var(--surface-hover); color:var(--text); text-decoration:none; }
.daily-work-page .notice-pill { display:inline-block; padding:2px 10px; border-radius:999px; background:var(--warn-bg); color:var(--warn-text); font-weight:600; }
.daily-heading h2 .daily-count { vertical-align:middle; margin-left:4px; }
.master-sets { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
.daily-work-page .master-set-card { display:flex; flex-direction:column; margin:0; padding:14px 16px; color:inherit; transition:border-color .15s, box-shadow .15s, transform .15s; }
.master-set-card:hover { border-color:var(--accent); box-shadow:0 4px 14px rgba(15,23,42,.1); transform:translateY(-1px); color:inherit; text-decoration:none; }
.master-set-icon { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:9px; background:var(--accent-soft); color:var(--accent-soft-text); }
.daily-work-page .master-set-card h3 { margin:10px 0 4px; }
.daily-work-page .master-set-card p.muted { margin:0 0 12px; min-height:2.6em; }
.daily-work-page .master-count { margin:auto 0 0; padding-top:10px; border-top:1px solid var(--border); color:var(--heading); font-size:22px; font-weight:700; line-height:1.2; }
.master-count span { color:var(--muted); font-size:12px; font-weight:500; }
.master-page .daily-filter select { min-width:140px; }
.daily-filter input[type="text"] { width:auto; min-width:220px; }
.daily-filter select, .daily-filter input[type="text"] { height:34px; }
.master-verify { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.daily-work-page .card.table-card { padding:0; overflow:hidden; }
.data-table-wrap { overflow-x:auto; }
.daily-part > .data-table, .daily-part > .master-fields { width:calc(100% + 28px); margin:0 -14px; }
.daily-work-page .data-table th, .daily-work-page .data-table td { padding:8px 10px; vertical-align:middle; }
.daily-work-page .data-table th { font-size:12px; white-space:nowrap; }
.daily-work-page .data-table th:first-child, .daily-work-page .data-table td:first-child { padding-left:14px; }
.daily-work-page .data-table th:last-child, .daily-work-page .data-table td:last-child { padding-right:14px; }
.data-table tbody tr:last-child > td, .master-fields tr:last-child > * { border-bottom:0; }
.data-table td:first-child a { font-weight:600; }
.master-sort { color:inherit; }
.master-sort:hover { color:var(--link); text-decoration:none; }
.master-sort.is-active { color:var(--accent-soft-text); }
.master-flag { text-align:center !important; }
.master-actions { white-space:nowrap; }
.master-actions form + form { margin-left:4px; }
.master-pager { display:flex; align-items:center; justify-content:center; gap:12px; padding:10px 14px; border-top:1px solid var(--border); background:var(--surface-2); }
.master-pager .daily-secondary { padding:5px 10px; }
.daily-work-page .master-fields th, .daily-work-page .master-fields td { padding:8px 14px; }
.daily-work-page .master-fields th { width:220px; background:transparent; color:var(--muted); font-weight:600; }
.daily-work-page .master-checks { gap:8px 20px; margin:12px 0 2px; }
.daily-work-page .master-checks > label { flex:0 0 auto; min-width:0; display:inline-flex; align-items:center; gap:6px; margin:0; color:var(--text); font-size:13px; font-weight:500; cursor:pointer; }
.master-checks input[type="checkbox"] { width:auto; margin:0; padding:0; }
/* 사용자 관리(2026-10-04): 권한·상태 배지, 승인 대기 행 강조, 같은 무게의 테두리 버튼, 아바타. */
.status-pill.warn { background:var(--warn-bg); color:var(--warn-text); }
.status-pill.info { background:var(--info-bg); color:var(--info-text); }
.daily-work-page .notice-pill.is-ok { background:var(--ok-bg); color:var(--ok-text); }
.daily-heading h2 .status-pill { vertical-align:middle; margin-left:2px; }
.user-name { display:inline-flex; align-items:center; gap:8px; font-weight:600; color:var(--heading); }
.user-avatar { display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; width:28px; height:28px; border-radius:50%; background:var(--accent-soft); color:var(--accent-soft-text); font-size:12px; font-weight:700; }
.user-avatar.is-admin { background:var(--accent); color:#fff; }
.user-table tr.is-pending > td { background:var(--warn-soft); }
.user-table tr.is-pending > td:first-child { box-shadow:inset 3px 0 0 #f59e0b; }
.user-table td.muted { white-space:nowrap; }
.user-account-actions { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.user-account-actions form.inline { display:inline; margin:0; }
.user-account-actions button, .user-account-link { display:inline-block; padding:4px 10px; border:1px solid var(--border-strong); border-radius:6px; background:var(--surface); color:var(--text); font-size:12.5px; font-weight:600; line-height:1.4; white-space:nowrap; text-decoration:none; box-shadow:none; }
.user-account-actions button:hover, .user-account-link:hover { background:var(--surface-hover); color:var(--text); text-decoration:none; }
.user-account-actions button.primary { border-color:var(--accent); background:var(--accent); color:#fff; }
.user-account-actions button.primary:hover { background:var(--accent-hover); }
.user-account-actions .danger, .user-account-link.danger { border-color:var(--bad-border); background:var(--surface); color:var(--danger-text); }
.user-account-actions .danger:hover, .user-account-link.danger:hover { background:var(--bad-soft); color:var(--danger-text); }
.daily-work-page .narrow-card { max-width:680px; padding:16px 18px; }
.narrow-card.is-danger { border-top:3px solid var(--danger); }
.user-summary { display:flex; align-items:center; gap:10px; margin:0 0 12px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--surface-2); }
.user-summary .user-avatar { width:36px; height:36px; font-size:14px; }
.daily-work-page .check-label { display:flex; align-items:flex-start; gap:8px; margin:6px 0; color:var(--text); font-size:13px; font-weight:500; cursor:pointer; }
.check-label input[type="checkbox"] { width:auto; margin:2px 0 0; padding:0; }
.daily-work-page .narrow-card > p.muted { margin:0 0 6px; font-weight:600; }
.temp-password-box { margin:0 0 4px; padding:14px 16px; border:1px dashed var(--accent); border-radius:8px; background:var(--accent-soft); }
.temp-password { color:var(--heading); font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:18px; font-weight:600; overflow-wrap:anywhere; user-select:all; }
/* LOT Tracker(2026-10-04): 파일 선택 상자, 오류·안내 상자, 스텝 선택 칩, 머리글이 고정되는 보고서 표. */
.lot-guide { max-width:960px; line-height:1.6; }
.lot-upload-form { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:10px 0 12px; padding:14px; border:1.5px dashed var(--border-strong); border-radius:10px; background:var(--surface-2); }
.lot-upload-form input[type="file"] { flex:1 1 260px; width:auto; padding:0; border:0; background:transparent; color:var(--muted); font-size:13px; }
.lot-upload-form input[type="file"]:focus { box-shadow:none; }
.lot-upload-form input[type="file"]::file-selector-button { margin-right:10px; padding:6px 12px; border:1px solid var(--border-strong); border-radius:8px; background:var(--surface); color:var(--text); font:inherit; font-weight:600; cursor:pointer; }
.lot-alert { margin:10px 0; padding:10px 12px; border:1px solid var(--bad-border); border-radius:8px; background:var(--bad-soft); color:var(--danger-text); font-size:13px; }
.lot-alert:focus { outline:none; box-shadow:0 0 0 3px var(--ring); }
.daily-work-page .card.lot-warning { border-left:3px solid #f59e0b; background:var(--warn-soft); }
.lot-note { margin:8px 0; padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--accent-soft); color:var(--text); font-size:13px; }
.lot-note.is-warn { border-color:var(--warn-border); border-left:3px solid #f59e0b; background:var(--warn-soft); }
.daily-part-head .lot-head-action { margin:0 0 0 auto; }
.lot-step-form { margin:12px 0 4px; padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); }
.lot-steps { margin:10px 0 0; padding:0; border:0; }
.lot-steps legend { margin-bottom:6px; padding:0; color:var(--muted); font-size:12px; font-weight:600; }
.lot-step-chips { display:flex; flex-wrap:wrap; gap:6px; }
.daily-work-page .lot-step-chip { display:inline-flex; align-items:center; gap:6px; margin:0; padding:4px 10px 4px 8px; border:1px solid var(--border-strong); border-radius:999px; background:var(--surface); color:var(--text); font-size:12.5px; font-weight:600; cursor:pointer; }
.lot-step-chip:has(input:checked) { border-color:var(--accent); background:var(--accent-soft); color:var(--accent-soft-text); }
.lot-step-chip input { width:auto; margin:0; padding:0; }
.lot-step-buttons { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.lot-table-wrap { overflow:auto; max-height:620px; margin:12px 0 4px; border:1px solid var(--border); border-radius:8px; }
.lot-table-wrap.is-short { max-height:420px; }
.lot-table { width:max-content; min-width:100%; }
.lot-table thead { position:sticky; top:0; z-index:2; }
.daily-work-page .lot-table th, .daily-work-page .lot-table td { padding:6px 8px; font-size:12.5px; }
.lot-table th { white-space:nowrap; }
.lot-table thead tr:first-child th[colspan] { text-align:center; background:linear-gradient(var(--accent-soft), var(--accent-soft)) var(--surface); color:var(--accent-soft-text); border-left:1px solid var(--border); }
.lot-table tbody tr:last-child > td { border-bottom:0; }
.lot-section { margin-top:10px; }
.lot-section > summary { color:var(--muted); font-weight:600; }
.lot-copy-text { width:100%; margin:8px 0; white-space:pre; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; }
.lot-actions { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 10px; padding-top:12px; border-top:1px solid var(--border); }
.lot-actions form { margin:0; }
.lot-pending > p { margin-top:0; }
@media (max-width:680px) {
  .user-table thead { display:none; }
  .user-table tbody { display:grid; gap:8px; padding:10px; }
  .user-table tr { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2px 10px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--surface); }
  .user-table tr.is-pending { border-color:var(--warn-border); background:var(--warn-soft); }
  .daily-work-page .user-table td { display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:3px 0 !important; border:0; background:transparent !important; box-shadow:none !important; white-space:normal !important; overflow-wrap:anywhere; }
  .user-table td[data-label]::before { content:attr(data-label); color:var(--muted); font-size:11.5px; font-weight:600; }
  .user-table td:nth-child(2) { grid-column:1 / -1; order:-1; }
  .user-table td:nth-child(2)::before { display:none; }
  .user-table td:nth-child(1), .user-table td.user-actions-cell, .user-table td[colspan] { grid-column:1 / -1; width:auto; }
}
@media (max-width:680px) {
  .daily-filter input[type="text"] { width:100%; min-width:0; }
  .table-card .data-table td { white-space:nowrap; }
  .daily-work-page .master-fields th { width:42%; }
}
@media (max-width:680px) {
  .daily-filter { gap:8px; }
  .daily-filter > div { flex:1 1 110px; }
  .daily-filter > div:last-child { flex:0 0 auto; }
  .daily-filter select { width:100%; min-width:0; }
  .daily-overview-head > .daily-overview-meta { flex:1 1 100%; }
  .daily-work-page .daily-list { padding-bottom:4px; }
  .daily-work-page .daily-item-table { width:100%; margin:0; }
  .daily-item-table thead { display:none; }
  .daily-item-table tbody { display:grid; gap:8px; padding:4px 0 10px; }
  .daily-item-table tr { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2px 10px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--surface); }
  .daily-work-page .daily-item-table td { display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:3px 0 !important; border:0; }
  .daily-item-table td[data-label]::before { content:attr(data-label); color:var(--muted); font-size:11.5px; font-weight:600; }
  .daily-item-table td:nth-child(3), .daily-item-table td[colspan] { grid-column:1 / -1; order:-1; }
  .daily-item-table tbody tr:hover > td { background:transparent; }
  .daily-item-actions { width:100%; }
}
@media print {
  .daily-work-page .daily-part > .daily-part-head { gap:4px; padding-bottom:0; background:#fff; border-bottom:0; }
  .daily-part > .daily-technical { border-top:0; }
  .daily-count { background:none; color:#000; padding:0; min-width:0; height:auto; font-size:16px; font-weight:600; }
  .daily-count::before { content:"("; }
  .daily-count::after { content:")"; }
}
@media print { .daily-technical > .report-table-wrap, .report-table details > pre { display:block !important; } .daily-technical::details-content, .report-table details::details-content { content-visibility:visible; display:block; } }
</style>
</head><body>
<div class="shell">
  <aside class="sidebar">
    <div class="sidebar-top"><span class="brand-mark">${icon('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>', 22)}</span><h1>${escapeHtml(L.appTitle)}</h1></div>
    ${user ? `<nav class="sidebar-nav">
      ${navItem("/daily-reports", "daily", L.navDailyReports, '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>')}
      ${navItem("/tasks", "tasks", L.navTasks, '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>')}
      ${taskSubNav}
      ${navItem("/full-analysis-reports", "full-analysis", L.navFullAnalysis, '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16V7"/>')}
      ${navItem("/master", "master-data", L.navMasterData, '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>')}
      ${user.role === "admin" ? navItem("/admin/users", "users", L.navUserApprovals, '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>') : ""}
    </nav>` : `<div style="flex:1;"></div>`}
    <div class="site-version"><a href="/api/version" title="${escapeHtml(versionLabels[0])}">${escapeHtml(versionLabels[0])} · v${escapeHtml(appPackage.version)}<br><span id="deployment-id">${escapeHtml(versionLabels[1])}</span></a></div>
  </aside>
  <main class="${escapeHtml(mainClass)}"><div class="page-tools no-print"><span class="lang-switcher" style="display:none;">${langSwitcher(lang)}</span>
      ${user ? `
      <div class="user-menu-container">
        <button type="button" class="user-menu-btn" onclick="toggleUserDropdown(event)">
          <span class="user-menu-avatar">${escapeHtml((user.display_name || "U").charAt(0).toUpperCase())}</span>
          <span class="account-info">${escapeHtml(user.display_name)} (${escapeHtml(L.roleLabels[user.role] || user.role)})</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
        </button>

        <div id="userProfileCard" class="user-profile-popover" style="display:none;" onclick="event.stopPropagation()">
          <div class="user-popover-header">
            <div class="user-popover-avatar">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div class="user-popover-name">${escapeHtml(user.display_name)} <span class="user-popover-role">${escapeHtml(L.roleLabels[user.role] || user.role)}</span></div>
            <div class="user-popover-email">${escapeHtml(user.username)}</div>
          </div>

          <div class="user-popover-body">
            <div class="popover-item" onclick="openChangePasswordModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 2-2 2m-6 6 7 7-2 2-2-2-2 2-2-2-7-7a5 5 0 0 1 7-7Z"/></svg>
              <span>${escapeHtml(L.changePassword)}</span>
            </div>

            <div class="popover-section-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
              <span>${escapeHtml(L.language)}</span>
            </div>
            <div class="user-lang-chips">
              <a href="/lang/ko" class="lang-chip ${lang === 'ko' ? 'active' : ''}">한국어</a>
              <a href="/lang/en" class="lang-chip ${lang === 'en' ? 'active' : ''}">English</a>
              <a href="/lang/vi" class="lang-chip ${lang === 'vi' ? 'active' : ''}">Tiếng Việt</a>
            </div>

            <div class="popover-divider"></div>

            <form method="post" action="/logout" class="popover-logout-form">
              <button type="submit" class="logout-button popover-logout-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                <span>${escapeHtml(L.logout)}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
      ` : `<a href="/login">${escapeHtml(L.login)}</a>`}
    </div>
    ${body}
  </main>
</div>
<div id="changePasswordModal" class="modal-backdrop" style="display:none;" onclick="if(event.target===this)closeChangePasswordModal()">
  <div class="modal-card">
    <div class="modal-header">
      <h3 style="margin:0;">${escapeHtml(L.changePassword)}</h3>
      <button type="button" class="modal-close-btn" onclick="closeChangePasswordModal()">&times;</button>
    </div>
    <form id="changePasswordForm" onsubmit="submitChangePassword(event)">
      <div id="changePassMsg" class="modal-msg" style="display:none;"></div>
      <label>${escapeHtml(L.newPasswordMin8)}</label>
      <input type="password" name="new_password" required minlength="8" placeholder="••••••••" autocomplete="new-password">
      <label>${escapeHtml(L.confirmNewPassword)}</label>
      <input type="password" name="confirm_password" required minlength="8" placeholder="••••••••" autocomplete="new-password">
      <div class="modal-actions">
        <button type="button" class="secondary" onclick="closeChangePasswordModal()">${escapeHtml(L.cancel)}</button>
        <button type="submit">${escapeHtml(L.save)}</button>
      </div>
    </form>
  </div>
</div>
<script>
function toggleUserDropdown(e){
  e.stopPropagation();
  var pop=document.getElementById('userProfileCard');
  if(pop) pop.style.display=(pop.style.display==='none'||!pop.style.display)?'block':'none';
}
document.addEventListener('click',function(e){
  var pop=document.getElementById('userProfileCard');
  if(pop&&!pop.contains(e.target)) pop.style.display='none';
});
function openChangePasswordModal(){
  var pop=document.getElementById('userProfileCard');
  if(pop) pop.style.display='none';
  var m=document.getElementById('changePasswordModal');
  if(m) m.style.display='flex';
}
function closeChangePasswordModal(){
  var m=document.getElementById('changePasswordModal');
  if(m) m.style.display='none';
  var msg=document.getElementById('changePassMsg');
  if(msg) msg.style.display='none';
  var f=document.getElementById('changePasswordForm');
  if(f) f.reset();
}
async function submitChangePassword(e){
  e.preventDefault();
  var form=e.target;
  var msg=document.getElementById('changePassMsg');
  var fd=new FormData(form);
  try{
    var res=await fetch('/api/user/change-password',{method:'POST',body:fd});
    var data=await res.json();
    if(res.ok){
      msg.className='modal-msg is-ok';
      msg.textContent=data.message||'OK';
      msg.style.display='block';
      setTimeout(closeChangePasswordModal,1500);
    }else{
      msg.className='modal-msg is-bad';
      msg.textContent=data.error||'Error';
      msg.style.display='block';
    }
  }catch(err){
    msg.className='modal-msg is-bad';
    msg.textContent='Network error';
    msg.style.display='block';
  }
}
fetch('/api/version', {cache:'no-store'}).then(function(r){if(!r.ok) throw new Error(); return r.json();}).then(function(v){
  const el=document.getElementById('deployment-id');
  if(el && v.deploymentId){el.textContent=v.deploymentId.slice(0,8); el.parentElement.title=v.deploymentId+(v.createdAt ? ' · '+v.createdAt : '');}
}).catch(function(){});
</script>
</body></html>`;
}

// /daily-items 와 /daily-reports 는 사이드바에서는 "일일업무 보고" 하나로 묶여 있고,
// 그 안에서 입력/조회를 오갈 수 있도록 각 페이지 상단에 작은 탭을 붙인다.
export function dailyWorkSubtabs(L, active, user) {
  return `<div class="subtabs">
    <a href="/daily-reports" class="${active === "report" ? "active" : ""}">${escapeHtml(L.tabDailyReport)}</a>
    <a href="/daily-items" class="${active === "input" ? "active" : ""}">${escapeHtml(L.tabDailyInput)}</a>
    <a href="/lot-tracker" class="${active === "tracker" ? "active" : ""}">LOT Tracker</a>
    ${user.role === "admin" ? `<a href="/daily-fields" class="${active === "settings" ? "active" : ""}">${escapeHtml(L.navDailyFields)}</a>` : ""}
  </div>`;
}

export function pageMenuPlaceholder(request, user, page) {
  const lang = getLang(request);
  const L = t(lang);
  const isFullAnalysis = page === "full-analysis";
  const title = isFullAnalysis ? L.navFullAnalysis : L.navMasterData;
  return html(layout({
    title,
    user,
    lang,
    activeNav: page,
    body: `<div class="card"><h2 style="margin-top:0;">${escapeHtml(title)}</h2><p class="muted">${escapeHtml(L.newMenuNotice)}</p></div>`,
  }));
}

export function forbiddenResponse(user, lang, L) {
  return html(layout({ title: L.notFoundTitle, user, lang, body: `<div class="card">${escapeHtml(L.adminOnlyNotice)}</div>` }), 403);
}
