/**
 * Users Admin Views — HTML templates for user approval list, edit, delete, temp password
 */

import { escapeHtml } from "../utils/helpers.js";
import { layout } from "./layout.js";
import { t } from "../i18n/index.js";

export const USERS_MAIN_CLASS = "daily-work-page users-page";

export function userAvatar(name, isAdmin = false) {
  const initial = Array.from(String(name || "").trim())[0] || "?";
  return `<span class="user-avatar${isAdmin ? " is-admin" : ""}" aria-hidden="true">${escapeHtml(initial.toUpperCase())}</span>`;
}

export function renderUserApprovalsView({ allUsers, notice, noticeClass, user, lang }) {
  const L = t(lang);
  const rows = allUsers.map((account) => {
    const isSelf = String(account.id) === String(user.id);
    const isPending = !account.email_verified_at;
    const isAdmin = account.role === "admin";

    let actions = "";
    if (isPending) {
      actions = `<form method="post" action="/admin/users/${account.id}/approve" class="inline">
          <button type="submit" class="small primary">${escapeHtml(L.approveBtn)}</button>
        </form>`;
    } else if (!isSelf) {
      const roleForm = isAdmin
        ? `<form method="post" action="/admin/users/${account.id}/demote" class="inline" onsubmit="return confirm('${escapeHtml(L.demoteConfirm)}');">
          <button type="submit" class="small">${escapeHtml(L.demoteBtn)}</button>
        </form>`
        : `<form method="post" action="/admin/users/${account.id}/promote" class="inline">
          <button type="submit" class="small">${escapeHtml(L.promoteBtn)}</button>
        </form>`;
      const revokeForm = `<form method="post" action="/admin/users/${account.id}/revoke" class="inline" onsubmit="return confirm('${escapeHtml(L.revokeConfirm)}');">
          <button type="submit" class="small danger">${escapeHtml(L.revokeBtn)}</button>
        </form>`;
      actions = `${roleForm} ${revokeForm}`;
    }
    if (!isAdmin) {
      actions += ` <a class="user-account-link" href="/admin/users/${account.id}/edit">${escapeHtml(L.editMemberBtn)}</a>
        <a class="user-account-link danger" href="/admin/users/${account.id}/delete">${escapeHtml(L.deleteMemberBtn)}</a>`;
      actions += ` <form method="post" action="/admin/users/${account.id}/password-reset" class="inline" data-confirm="${escapeHtml(L.resetMemberPasswordConfirm)}" onsubmit="return confirm(this.dataset.confirm);">
          <button type="submit" class="small secondary">${escapeHtml(L.resetMemberPasswordBtn)}</button>
        </form>`;
    }

    return `
    <tr${isPending ? ' class="is-pending"' : ""}>
      <td data-label="${escapeHtml(L.emailLabel)}">${escapeHtml(account.username)}</td>
      <td data-label="${escapeHtml(L.displayName)}"><span class="user-name">${userAvatar(account.display_name, isAdmin)}${escapeHtml(account.display_name)}</span></td>
      <td data-label="${escapeHtml(L.roleLabel)}"><span class="status-pill${isAdmin ? " info" : ""}">${escapeHtml(isAdmin ? L.roleAdmin : L.roleMember)}</span></td>
      <td data-label="${escapeHtml(L.statusLabel)}"><span class="status-pill ${isPending ? "warn" : "done"}">${escapeHtml(isPending ? L.statusPending : L.statusApproved)}</span></td>
      <td data-label="${escapeHtml(L.colRequestedAt)}" class="muted">${escapeHtml(account.created_at)}</td>
      <td class="user-actions-cell"><div class="user-account-actions">${actions}</div></td>
    </tr>`;
  }).join("");

  const pendingCount = allUsers.filter((account) => !account.email_verified_at).length;

  return layout({
    title: L.userApprovalsHeading,
    user,
    lang,
    activeNav: "users",
    mainClass: USERS_MAIN_CLASS,
    body: `<header class="daily-heading">
      <div><h2>${escapeHtml(L.userApprovalsHeading)} <span class="daily-count">${allUsers.length}</span>${pendingCount ? ` <span class="status-pill warn">${escapeHtml(L.statusPending)} ${pendingCount}</span>` : ""}</h2>
      <p class="muted">${escapeHtml(L.approvalHelp)}</p>
      ${notice ? `<p class="muted ${noticeClass}">${escapeHtml(notice)}</p>` : ""}</div>
    </header>
    <div class="card table-card">
      <div class="data-table-wrap"><table class="data-table user-table">
        <thead><tr><th>${escapeHtml(L.emailLabel)}</th><th>${escapeHtml(L.displayName)}</th><th>${escapeHtml(L.roleLabel)}</th><th>${escapeHtml(L.statusLabel)}</th><th>${escapeHtml(L.colRequestedAt)}</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">${escapeHtml(L.noPendingUsers)}</td></tr>`}</tbody>
      </table></div>
    </div>`,
  });
}

export function renderMemberAccountFormView({ target, action, error = null, user, lang }) {
  const L = t(lang);
  const deleting = action === "delete";
  const title = deleting ? L.deleteMemberBtn : L.editMemberBtn;
  return layout({
    title,
    user,
    lang,
    activeNav: "users",
    mainClass: USERS_MAIN_CLASS,
    body: `<header class="daily-heading">
      <div><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(deleting ? L.deleteMemberHelp : L.editMemberHelp)}</p></div>
      <a class="daily-secondary" href="/admin/users">${escapeHtml(L.backToList)}</a>
    </header>
    <div class="card narrow-card${deleting ? " is-danger" : ""}">
    ${deleting ? `<div class="user-summary">${userAvatar(target.display_name)}<div><strong>${escapeHtml(target.display_name)}</strong><div class="muted">${escapeHtml(target.username)}</div></div></div>` : ""}
    ${error ? `<p role="alert" class="err">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="/admin/users/${target.id}/${action}" class="daily-form">
      ${deleting ? `<label class="check-label"><input type="checkbox" name="confirm_delete" value="yes" required> ${escapeHtml(L.deleteMemberConfirm)}</label>`
        : `<label for="member-name">${escapeHtml(L.displayName)}</label>
          <input id="member-name" name="display_name" value="${escapeHtml(target.display_name)}" maxlength="100" required>
          <label for="member-email">${escapeHtml(L.emailLabel)}</label>
          <input id="member-email" type="email" name="username" value="${escapeHtml(target.username)}" maxlength="254" required>`}
      <div class="daily-form-actions"><button type="submit"${deleting ? ' class="danger"' : ""}>${escapeHtml(deleting ? L.deleteMemberBtn : L.save)}</button></div>
    </form>
  </div>`,
  });
}

export function renderResetMemberPasswordView({ target, temporaryPassword, user, lang }) {
  const L = t(lang);
  return layout({
    title: L.resetMemberPasswordHeading,
    user,
    lang,
    activeNav: "users",
    mainClass: USERS_MAIN_CLASS,
    body: `<header class="daily-heading">
      <div><h2>${escapeHtml(L.resetMemberPasswordHeading)}</h2><p class="muted">${escapeHtml(L.resetMemberPasswordHelp)}</p></div>
      <a class="daily-secondary" href="/admin/users">${escapeHtml(L.backToList)}</a>
    </header>
    <div class="card narrow-card">
      <p class="muted">${escapeHtml(L.resetMemberPasswordAccount)}</p>
      <div class="user-summary">${userAvatar(target.display_name)}<div><strong>${escapeHtml(target.display_name)}</strong><div class="muted">${escapeHtml(target.username)}</div></div></div>
      <p class="muted">${escapeHtml(L.resetMemberPasswordValue)}</p>
      <div class="temp-password-box"><code class="temp-password">${escapeHtml(temporaryPassword)}</code></div>
    </div>`,
  });
}

