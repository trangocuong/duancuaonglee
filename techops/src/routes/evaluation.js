import {
  COMMON_SECURITY_HEADERS, plainText, html, escapeHtml,
} from "../utils/helpers.js";
import { layout } from "../views/layout.js";
import { getLang, t } from "../../i18n.js";
import { clientJs, clientCss, reportTemplate } from "../../evaluation/generated/assets.js";

export function evaluationAsset(request) {
  const url = new URL(request.url);
  const headers = { ...COMMON_SECURITY_HEADERS };
  if (url.pathname === "/evaluation/client.js") return new Response(clientJs, { headers: { ...headers, "content-type": "text/javascript; charset=utf-8" } });
  if (url.pathname === "/evaluation/client.css") return new Response(clientCss, { headers: { ...headers, "content-type": "text/css; charset=utf-8" } });
  if (url.pathname === "/evaluation/template.xlsx") {
    const bytes = Uint8Array.from(atob(reportTemplate), c => c.charCodeAt(0));
    return new Response(bytes, { headers: { ...headers, "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="evaluation-report-template.xlsx"' } });
  }
  if (url.pathname !== "/evaluation/app") return plainText("Not found", 404);
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>평가업무 관리</title><link rel="stylesheet" href="/evaluation/client.css"></head><body><div id="evaluation-root"></div><script type="module" src="/evaluation/client.js"></script></body></html>`, {
    headers: { ...headers, "x-frame-options": "SAMEORIGIN", "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'" },
  });
}

export function pageEvaluation(request, user) {
  const lang = getLang(request), requested = new URL(request.url).searchParams.get("section") || "overview";
  const sections = ["overview", "list", "new-product", "mass-report", "history", "reports", ...(user.role === "admin" ? ["users"] : [])];
  const section = sections.includes(requested) ? requested : "overview";
  // The frame fills the space under the fixed header so only the evaluation document scrolls.
  // While a Q-EVAL dialog is open the frame covers the whole window; dialogs are wider than the
  // area beside the sidebar and would otherwise be clipped.
  return html(layout({
    title: t(lang).navTasks,
    user,
    lang,
    activeNav: "tasks",
    activeSubNav: section,
    mainClass: "evaluation-main",
    body: `
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
    </script>`
  }));
}
