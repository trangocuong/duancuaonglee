/**
 * User Admin routes (/admin/users) — approvals, edit, delete, password reset, promote, demote, revoke
 */

import {
  escapeHtml,
  html,
  redirect,
  plainText,
  randomBytes,
  hashPassword,
  HTML_SECURITY_HEADERS,
  isAllowedSignupEmail,
} from "../utils/helpers.js";
import { forbiddenResponse } from "../views/layout.js";
import { getLang, t } from "../i18n/index.js";
import {
  userAvatar,
  renderUserApprovalsView,
  renderMemberAccountFormView,
  renderResetMemberPasswordView,
  USERS_MAIN_CLASS,
} from "../views/users.js";

export { userAvatar, USERS_MAIN_CLASS };

export async function pageUserApprovals(request, env, user) {
  const lang = getLang(request, user);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const allUsers = await env.DB.prepare(
    `SELECT id, username, display_name, role, email_verified_at, created_at
       FROM techops_users
      ORDER BY (email_verified_at IS NULL) DESC, created_at, id`
  ).all();

  const blocked = new URL(request.url).searchParams.get("blocked");
  const result = new URL(request.url).searchParams.get("result");
  const notice = blocked === "self" ? L.cannotChangeSelfNotice
    : result === "saved" ? L.memberSaved : result === "deleted" ? L.memberDeleted : null;
  const noticeClass = blocked === "self" ? "notice-pill" : "notice-pill is-ok";

  return html(renderUserApprovalsView({
    allUsers: allUsers.results,
    notice,
    noticeClass,
    user,
    lang,
  }));
}

export function memberAccountForm(request, user, target, action, error = null, status = 200) {
  const lang = getLang(request, user);
  return html(renderMemberAccountFormView({ target, action, error, user, lang }), status);
}

export async function handleMemberAccount(request, env, user, id, action) {
  const L = t(getLang(request));
  if (user.role !== "admin") return forbiddenResponse(user, getLang(request), L);
  const target = await env.DB.prepare(
    `SELECT id, username, display_name, role FROM techops_users WHERE id = ?`
  ).bind(id).first();
  if (!target) return plainText(L.notFoundPlain, 404);
  if (target.role !== "member" || String(target.id) === String(user.id)) return plainText(L.memberOnlyNotice, 403);
  if (request.method === "GET") return memberAccountForm(request, user, target, action);

  const form = await request.formData();
  // Every statement rechecks the target's role and email inside the transaction.
  // Stale requests must not affect an account promoted or renamed in the meantime.
  const eligible = `SELECT id FROM techops_users WHERE id = ? AND role = 'member' AND username = ?`;
  const statements = [];
  if (action === "edit") {
    const username = String(form.get("username") || "").trim().toLowerCase();
    const displayName = String(form.get("display_name") || "").trim();
    const values = { ...target, username, display_name: displayName };
    if (!isAllowedSignupEmail(username) || username.length > 254) return memberAccountForm(request, user, values, action, L.invalidDomain, 400);
    if (!displayName || displayName.length > 100) return memberAccountForm(request, user, values, action, L.checkInput, 400);
    const duplicate = await env.DB.prepare(`SELECT id FROM techops_users WHERE lower(username) = ? AND id <> ?`).bind(username, id).first();
    if (duplicate) return memberAccountForm(request, user, values, action, L.usernameTaken, 400);
    if (username !== target.username) {
      for (const table of ["techops_sessions", "techops_password_resets", "techops_email_verifications"]) {
        statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE user_id = (${eligible})`).bind(id, target.username));
      }
      statements.push(env.DB.prepare(`DELETE FROM techops_login_attempts WHERE username IN (?, ?) AND EXISTS (${eligible})`).bind(target.username, username, id, target.username));
    }
    statements.push(env.DB.prepare(`UPDATE techops_users SET username = ?, display_name = ? WHERE id = (${eligible})`).bind(username, displayName, id, target.username));
    try {
      const results = await env.DB.batch(statements);
      if (results.at(-1).meta.changes !== 1) return plainText(L.memberOnlyNotice, 409);
    } catch (error) {
      if (/UNIQUE constraint failed: techops_users.username/i.test(String(error))) return memberAccountForm(request, user, values, action, L.usernameTaken, 400);
      throw error;
    }
    return redirect("/admin/users?result=saved");
  }

  if (form.get("confirm_delete") !== "yes") return memberAccountForm(request, user, target, action, L.deleteMemberConfirm, 400);
  // Detach authorship without deleting business records; keep owner names/content.
  // The master-data columns are logical references without foreign-key constraints.
  for (const [table, column] of [
    ["tech_task", "created_by"], ["tech_update", "author_id"],
    ["tech_daily_report", "created_by"], ["tech_daily_item", "created_by"],
    ["tech_daily_update", "author_id"], ["tech_report_log", "generated_by"],
    ["tech_master_set", "owner_user_id"], ["tech_master_row", "created_by"],
    ["tech_master_row", "updated_by"], ["tech_master_log", "actor_user_id"],
    ["tech_lot_info", "imported_by"],
  ]) {
    statements.push(env.DB.prepare(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = (${eligible})`).bind(id, target.username));
  }
  statements.push(env.DB.prepare(`DELETE FROM techops_login_attempts WHERE username = ? AND EXISTS (${eligible})`).bind(target.username, id, target.username));
  // Session and token foreign keys cascade with the account in the same batch.
  statements.push(env.DB.prepare(`DELETE FROM techops_users WHERE id = (${eligible})`).bind(id, target.username));
  const results = await env.DB.batch(statements);
  if (results.at(-1).meta.changes !== 1) return plainText(L.memberOnlyNotice, 409);
  return redirect("/admin/users?result=deleted");
}

export async function handleUserApprove(request, env, user, id) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  await env.DB.prepare(
    `UPDATE techops_users
        SET email_verified_at = COALESCE(email_verified_at, datetime('now'))
      WHERE id = ? AND role = 'member'`
  ).bind(id).run();
  return redirect("/admin/users");
}

export async function handleUserPasswordReset(request, env, user, id) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);

  const target = await env.DB.prepare(
    `SELECT id, username, display_name FROM techops_users WHERE id = ? AND role = 'member'`
  ).bind(id).first();
  if (!target) return plainText(L.resetMemberPasswordAdminBlocked, 403);

  const temporaryPassword = `Temp-${Array.from(randomBytes(12), (value) => value.toString(16).padStart(2, "0")).join("")}`;
  const { salt, hash } = await hashPassword(temporaryPassword);
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE techops_users SET password_hash = ?, password_salt = ? WHERE id = ? AND role = 'member'`
    ).bind(hash, salt, target.id),
    env.DB.prepare(
      `DELETE FROM techops_sessions WHERE user_id = (SELECT id FROM techops_users WHERE id = ? AND role = 'member')`
    ).bind(target.id),
    env.DB.prepare(
      `DELETE FROM techops_password_resets WHERE user_id = (SELECT id FROM techops_users WHERE id = ? AND role = 'member')`
    ).bind(target.id),
    env.DB.prepare(
      `DELETE FROM techops_login_attempts WHERE username = (SELECT username FROM techops_users WHERE id = ? AND role = 'member')`
    ).bind(target.id),
  ]);
  if (results[0].meta.changes !== 1) return plainText(L.resetMemberPasswordAdminBlocked, 403);

  return new Response(renderResetMemberPasswordView({
    target,
    temporaryPassword,
    user,
    lang,
  }), {
    status: 200,
    headers: { ...HTML_SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

// promote/demote/revoke는 관리자 확인에 더해, 관리자가 자기 자신의 권한·접근 상태는
// 바꿀 수 없다는 같은 규칙을 공유한다(다른 관리자가 있어야만 서로를 조정 가능 — 이 규칙
// 하나로 관리자가 0명이 되는 상황이 구조적으로 발생하지 않는다).
export function guardUserManagementAction(request, user, id) {
  const lang = getLang(request);
  const L = t(lang);
  if (user.role !== "admin") return forbiddenResponse(user, lang, L);
  if (String(id) === String(user.id)) return redirect("/admin/users?blocked=self");
  return null;
}

export async function handleUserPromote(request, env, user, id) {
  const denied = guardUserManagementAction(request, user, id);
  if (denied) return denied;

  await env.DB.prepare(
    `UPDATE techops_users SET role = 'admin' WHERE id = ? AND role = 'member'`
  ).bind(id).run();
  return redirect("/admin/users");
}

export async function handleUserDemote(request, env, user, id) {
  const denied = guardUserManagementAction(request, user, id);
  if (denied) return denied;

  await env.DB.prepare(
    `UPDATE techops_users SET role = 'member' WHERE id = ? AND role = 'admin'`
  ).bind(id).run();
  return redirect("/admin/users");
}

export async function handleUserRevoke(request, env, user, id) {
  const denied = guardUserManagementAction(request, user, id);
  if (denied) return denied;

  await env.DB.batch([
    env.DB.prepare(`UPDATE techops_users SET email_verified_at = NULL WHERE id = ?`).bind(id),
    // 접근 차단은 즉시 효력이 있어야 하므로 남아있는 로그인 세션도 함께 폐기한다.
    env.DB.prepare(`DELETE FROM techops_sessions WHERE user_id = ?`).bind(id),
  ]);
  return redirect("/admin/users");
}
