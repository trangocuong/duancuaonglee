import appPackage from "./package.json" with { type: "json" };
import {
  json, html, plainText, redirect,
  isSameOriginMutation, escapeHtml,
} from "./src/utils/helpers.js";
import { layout, dailyWorkSubtabs, pageMenuPlaceholder } from "./src/views/layout.js";
import { getLang, t } from "./src/i18n/index.js";

// Routes & Handlers
import { evaluationAsset, pageEvaluation } from "./src/routes/evaluation.js";
import { handleEvaluationApi } from "./evaluation/generated/server.js";
import {
  pageDashboard, handleTaskCreate, pageTaskDetail,
  handleTaskUpdateStatus, handleTaskAddUpdate,
  apiListTasks, apiListReports, apiCreateReport,
} from "./src/routes/tasks.js";
import {
  pageMasterIndex, pageMasterList, pageMasterRowDetail, pageMasterSetup,
  handleMasterSetCreate, handleMasterSetUpdate, pageMasterSetDetail,
  handleMasterFieldCreate, pageMasterFieldDetail, handleMasterFieldUpdate,
  handleMasterFieldDelete, handleMasterFieldMove,
} from "./src/routes/master.js";
import { pageDailyReports } from "./src/routes/daily-reports.js";
import {
  pageDailyItems, handleDailyItemCreate, pageDailyItemDetail,
  handleDailyItemAddUpdate, handleDailyItemDelete, handleDailyItemClose,
} from "./src/routes/daily-items.js";
import {
  loadDailyFields, hasDailyClassification,
  fieldTransfer, pageDailyFields, handleDailyFieldCreate,
  handleDailyFieldTemplateApply, pageDailyFieldDetail,
  handleDailyFieldUpdate, handleDailyFieldDelete,
  handleDailyFieldMove, handleDailyFieldOptionCreate,
  handleDailyFieldOptionDelete, handleDailyFieldOptionImport,
} from "./src/routes/daily-fields.js";
import { apiProductMatch } from "./src/modules/daily/daily-helpers.js";
import {
  requireAuth,
  pageLogin, handleLoginPost, handleLogout, handleLangSwitch,
  pageSignup, handleSignupPost, handleVerifyEmail,
  pageResendVerification, handleResendVerificationPost,
  pageForgotPassword, handleForgotPasswordPost,
  pageResetPassword, handleResetPasswordPost,
  pageSetup, handleSetupPost, handleChangePassword,
} from "./src/routes/auth.js";
import {
  pageUserApprovals, handleMemberAccount, handleUserApprove,
  handleUserPasswordReset, handleUserPromote, handleUserDemote, handleUserRevoke,
} from "./src/routes/users.js";
import { RETIRED_DAILY_FIELDS, handleLotInfoApi } from "./src/modules/lot/lot-info.js";
import { handleLotTracker } from "./src/modules/lot/lot-tracker.js";

/**
 * YieldOps 제품기술 업무관리 (workmanager)
 * Clean modular Cloudflare Worker entry point
 */
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

