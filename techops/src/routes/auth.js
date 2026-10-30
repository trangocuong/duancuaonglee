/**
 * Auth routes — Login, Logout, Signup, Email Verification, Password Reset, Setup, Change Password
 */

import {
  escapeHtml,
  html,
  redirect,
  json,
  plainText,
  parseCookies,
  sessionCookie,
  clearedSessionCookie,
  hashPassword,
  verifyPassword,
  randomToken,
  isAllowedSignupEmail,
  SIGNUP_EMAIL_DOMAIN,
} from "../utils/helpers.js";
import { layout } from "../views/layout.js";
import { getLang, t, langCookie } from "../i18n/index.js";

export const SESSION_TTL_DAYS = 7;
export const MAX_LOGIN_FAILS = 5;
export const LOCKOUT_MINUTES = 15;
export const MEMBER_LOGIN_ALLOWED_IPS = ["117.4.33.107", "14.241.73.189", "134.231.132.48"];
export const RESET_TOKEN_TTL_MINUTES = 30;
export const EMAIL_VERIFY_TOKEN_TTL_MINUTES = 60 * 24;

export async function getCurrentUser(request, env) {
  const cookies = parseCookies(request);
  const token = cookies["session"];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.role, s.expires_at
       FROM techops_sessions s JOIN techops_users u ON u.id = s.user_id
      WHERE s.id = ?`
  ).bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at + "Z") < new Date()) return null;
  return row;
}

export async function requireAuth(request, env) {
  const user = await getCurrentUser(request, env);
  return user;
}

// #endregion

// #region 이메일 발송 (Resend API)

export async function sendAppEmail(env, toEmail, subject, bodyHtml) {
  if (!env.RESEND_API_KEY) {
    console.log("RESEND_API_KEY not configured; cannot send email to", toEmail);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESET_EMAIL_FROM || "Workmanager <onboarding@resend.dev>",
        to: [toEmail],
        subject,
        html: bodyHtml,
      }),
    });
    if (!res.ok) { const bodyText = await res.text().catch(() => ""); console.log("sendAppEmail http error", res.status, bodyText); } return res.ok;
  } catch (e) {
    console.log("sendAppEmail failed:", e && e.message);
    return false;
  }
}

export async function sendResetEmail(env, toEmail, lang, resetUrl) {
  const L = t(lang);
  const bodyHtml = `
    <div style="font-family:sans-serif;">
      <p>${escapeHtml(L.resetEmailGreeting)}</p>
      <p><a href="${resetUrl}">${escapeHtml(L.resetEmailLinkText)}</a></p>
      <p style="color:#888;font-size:14px;">${escapeHtml(L.resetEmailExpiry)}</p>
    </div>`;
  return sendAppEmail(env, toEmail, L.resetEmailSubject, bodyHtml);
}

export async function sendVerificationEmail(env, toEmail, lang, verifyUrl) {
  const L = t(lang);
  const bodyHtml = `
    <div style="font-family:sans-serif;">
      <p>${escapeHtml(L.verifyEmailGreeting)}</p>
      <p><a href="${verifyUrl}">${escapeHtml(L.verifyEmailLinkText)}</a></p>
      <p style="color:#888;font-size:14px;">${escapeHtml(L.verifyEmailExpiry)}</p>
    </div>`;
  return sendAppEmail(env, toEmail, L.verifyEmailSubject, bodyHtml);
}

export async function pageLogin(request, env, error) {
  const lang = getLang(request);
  const L = t(lang);
  const url = new URL(request.url);
  let notice = null;
  if (url.searchParams.get("signup") === "1") notice = L.signupDoneNotice;
  else if (url.searchParams.get("verify") === "1") notice = L.signupVerifyNotice;
  else if (url.searchParams.get("verified") === "1") notice = L.verifiedNotice;
  else if (url.searchParams.get("reset") === "1") notice = L.resetSuccessNotice;
  return html(layout({
    title: L.login, user: null, lang, body: `
    <div class="card" style="max-width:360px;margin:60px auto;">
      <h2 style="margin-top:0;">${escapeHtml(L.login)}</h2>
      ${notice ? `<p class="muted">${escapeHtml(notice)}</p>` : ""}
      <form method="post" action="/login">
        <label>${escapeHtml(L.username)}</label>
        <input name="username" required autofocus>
        <label>${escapeHtml(L.password)}</label>
        <input name="password" type="password" required>
        ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.login)}</button></div>
      </form>
      <p class="muted" style="margin-top:14px;">
        <a href="/forgot-password">${escapeHtml(L.forgotPassword)}</a>
        &nbsp;·&nbsp;
        ${escapeHtml(L.noAccountYet)} <a href="/signup">${escapeHtml(L.signup)}</a>
        &nbsp;·&nbsp;
        <a href="/resend-verification">${escapeHtml(L.resendVerification)}</a>
      </p>
    </div>` }));
}

export async function handleLoginPost(request, env) {
  const lang = getLang(request);
  const L = t(lang);
  const form = await request.formData();
  const username = String(form.get("username") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!username || !password) return pageLogin(request, env, L.enterCredentials);

  const attempt = await env.DB.prepare(
    `SELECT fail_count, locked_until FROM techops_login_attempts WHERE username = ?`
  ).bind(username).first();
  const now = new Date();
  if (attempt && attempt.locked_until && new Date(attempt.locked_until + "Z") > now) {
    return pageLogin(request, env, L.tooManyAttempts);
  }

  const user = await env.DB.prepare(
    `SELECT id, username, display_name, role, password_hash, password_salt, email_verified_at FROM techops_users WHERE username = ?`
  ).bind(username).first();

  const ok = user ? await verifyPassword(password, user.password_salt, user.password_hash) : false;

  if (!ok) {
    const failCount = (attempt?.fail_count || 0) + 1;
    const lockedUntil = failCount >= MAX_LOGIN_FAILS
      ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000).toISOString().replace("Z", "")
      : null;
    await env.DB.prepare(
      `INSERT INTO techops_login_attempts (username, fail_count, locked_until, last_attempt_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET fail_count=excluded.fail_count, locked_until=excluded.locked_until, last_attempt_at=excluded.last_attempt_at`
    ).bind(username, failCount, lockedUntil, now.toISOString().replace("Z", "")).run();
    return pageLogin(request, env, L.invalidCredentials);
  }

  if (!user.email_verified_at) {
    // 자격 증명은 정상이므로 로그인 실패로 집계하지 않음 (계정 잠금 대상 아님)
    return pageLogin(request, env, L.emailNotVerified); } if (user.role !== "admin" && MEMBER_LOGIN_ALLOWED_IPS.length > 0 && !MEMBER_LOGIN_ALLOWED_IPS.includes(request.headers.get("CF-Connecting-IP") || "")) { return pageLogin(request, env, L.ipRestricted);
  }

  await env.DB.prepare(`DELETE FROM techops_login_attempts WHERE username = ?`).bind(username).run();

  const token = randomToken(40);
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 86400000).toISOString().replace("Z", "");
  await env.DB.prepare(
    `INSERT INTO techops_sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, user.id, expires).run();

  return redirect("/daily-reports", { "set-cookie": sessionCookie(token, SESSION_TTL_DAYS * 86400) });
}

export async function handleLogout(request, env) {
  const cookies = parseCookies(request);
  const token = cookies["session"];
  if (token) await env.DB.prepare(`DELETE FROM techops_sessions WHERE id = ?`).bind(token).run();
  return redirect("/login", { "set-cookie": clearedSessionCookie() });
}

export function handleLangSwitch(request, code) {
  const referer = request.headers.get("referer");
  let back = "/daily-reports";
  if (referer) {
    try {
      const u = new URL(referer);
      back = u.pathname + u.search;
    } catch (e) { /* ignore malformed referer */ }
  }
  return redirect(back, { "set-cookie": langCookie(code) });
}

// ---------- 회원가입 ----------

// #endregion

// #region 인증 — 회원가입 · 이메일 인증 · 인증메일 재전송

export async function pageSignup(request, env, error, notice) {
  const lang = getLang(request);
  const L = t(lang);
  return html(layout({
    title: L.signupHeading, user: null, lang, body: `
    <div class="card" style="max-width:400px;margin:60px auto;">
      <h2 style="margin-top:0;">${escapeHtml(L.signupHeading)}</h2>
      <p class="muted">${escapeHtml(L.domainNotice)}</p>
      ${notice ? `<p class="muted">${escapeHtml(notice)}</p>` : ""}
      <form method="post" action="/signup">
        <label>${escapeHtml(L.username)} (${escapeHtml(L.emailLabel)})</label>
        <input name="username" type="email" required autofocus placeholder="name@${SIGNUP_EMAIL_DOMAIN}">
        <label>${escapeHtml(L.displayName)}</label>
        <input name="display_name" required>
        <label>${escapeHtml(L.password)}</label>
        <input name="password" type="password" required minlength="8">
        ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.signupBtn)}</button></div>
      </form>
      <p class="muted" style="margin-top:14px;"><a href="/login">${escapeHtml(L.backToLogin)}</a></p>
    </div>` }));
}

export async function handleSignupPost(request, env) {
  const lang = getLang(request);
  const L = t(lang);
  const form = await request.formData();
  const username = String(form.get("username") || "").trim().toLowerCase();
  const displayName = String(form.get("display_name") || "").trim();
  const password = String(form.get("password") || "");

  if (MEMBER_LOGIN_ALLOWED_IPS.length > 0 && !MEMBER_LOGIN_ALLOWED_IPS.includes(request.headers.get("CF-Connecting-IP") || "")) { return pageSignup(request, env, L.signupIpRestricted); } if (!isAllowedSignupEmail(username)) {
    return pageSignup(request, env, L.invalidDomain);
  }
  if (!displayName || password.length < 8) {
    return pageSignup(request, env, L.checkInput);
  }

  const existing = await env.DB.prepare(`SELECT id FROM techops_users WHERE username = ?`).bind(username).first();
  if (existing) {
    return pageSignup(request, env, L.usernameTaken);
  }

  const { salt, hash } = await hashPassword(password);
  const requireVerification = !!env.RESEND_API_KEY;
  const now = new Date();
  // RESEND_API_KEY가 설정되어 있지 않으면 인증 메일을 보낼 수 없으므로,
  // 이 경우에는 기존 동작대로 즉시 활성화한다 (설정 완료 시 자동으로 인증 절차가 적용됨).
  const verifiedAt = requireVerification ? null : now.toISOString().replace("Z", "");
  const insertRes = await env.DB.prepare(
    `INSERT INTO techops_users (username, password_hash, password_salt, display_name, role, email_verified_at) VALUES (?, ?, ?, ?, 'member', ?)`
  ).bind(username, hash, salt, displayName, verifiedAt).run();

  if (!requireVerification) {
    return redirect("/login?signup=1");
  }

  const userId = insertRes.meta.last_row_id;
  const token = randomToken(48);
  const expires = new Date(now.getTime() + EMAIL_VERIFY_TOKEN_TTL_MINUTES * 60000).toISOString().replace("Z", "");
  await env.DB.prepare(
    `INSERT INTO techops_email_verifications (token, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, userId, expires).run();

  const origin = new URL(request.url).origin;
  const verifyUrl = `${origin}/verify-email?token=${token}`;
  const sent = await sendVerificationEmail(env, username, lang, verifyUrl);
  if (!sent) {
    console.log(`verification email send failed for ${username}`);
  }

  return redirect("/login?verify=1");
}

// ---------- 이메일 인증 ----------

export async function handleVerifyEmail(request, env) {
  const lang = getLang(request);
  const L = t(lang);
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  const row = token ? await env.DB.prepare(
    `SELECT token, user_id, expires_at, used_at FROM techops_email_verifications WHERE token = ?`
  ).bind(token).first() : null;
  const valid = row && !row.used_at && new Date(row.expires_at + "Z") > new Date();

  if (!valid) {
    return html(layout({ title: L.verifyEmailHeading, user: null, lang, body: `
      <div class="card" style="max-width:400px;margin:60px auto;">
        <div class="err">${escapeHtml(L.verifyInvalidToken)}</div>
        <p class="muted" style="margin-top:14px;"><a href="/resend-verification">${escapeHtml(L.resendVerification)}</a></p>
      </div>` }), 400);
  }

  await env.DB.prepare(`UPDATE techops_users SET email_verified_at = datetime('now') WHERE id = ?`).bind(row.user_id).run();
  await env.DB.prepare(`UPDATE techops_email_verifications SET used_at = datetime('now') WHERE token = ?`).bind(token).run();
  await env.DB.prepare(`DELETE FROM techops_email_verifications WHERE user_id = ? AND token != ?`).bind(row.user_id, token).run();

  return redirect("/login?verified=1");
}

export async function pageResendVerification(request, env, error, notice) {
  const lang = getLang(request);
  const L = t(lang);
  return html(layout({
    title: L.resendVerificationHeading, user: null, lang, body: `
    <div class="card" style="max-width:400px;margin:60px auto;">
      <h2 style="margin-top:0;">${escapeHtml(L.resendVerificationHeading)}</h2>
      <p class="muted">${escapeHtml(L.resendVerificationNotice)}</p>
      ${notice ? `<p class="muted">${escapeHtml(notice)}</p>` : ""}
      <form method="post" action="/resend-verification">
        <label>${escapeHtml(L.username)} (${escapeHtml(L.emailLabel)})</label>
        <input name="username" type="email" required autofocus>
        ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.resendVerificationBtn)}</button></div>
      </form>
      <p class="muted" style="margin-top:14px;"><a href="/login">${escapeHtml(L.backToLogin)}</a></p>
    </div>` }));
}

export async function handleResendVerificationPost(request, env) {
  const lang = getLang(request);
  const L = t(lang);
  const form = await request.formData();
  const username = String(form.get("username") || "").trim().toLowerCase();

  if (username) {
    const user = await env.DB.prepare(`SELECT id, email_verified_at FROM techops_users WHERE username = ?`).bind(username).first();
    if (user && !user.email_verified_at) {
      const token = randomToken(48);
      const now = new Date();
      const expires = new Date(now.getTime() + EMAIL_VERIFY_TOKEN_TTL_MINUTES * 60000).toISOString().replace("Z", "");
      await env.DB.prepare(
        `INSERT INTO techops_email_verifications (token, user_id, expires_at) VALUES (?, ?, ?)`
      ).bind(token, user.id, expires).run();

      const origin = new URL(request.url).origin;
      const verifyUrl = `${origin}/verify-email?token=${token}`;
      const sent = await sendVerificationEmail(env, username, lang, verifyUrl);
      if (!sent) {
        console.log(`resend verification email failed for ${username}`);
      }
    }
  }

  // 계정 존재/인증 여부와 관계없이 항상 동일한 메시지 (사용자 열거 공격 방지)
  return pageResendVerification(request, env, null, L.resendVerificationSentNotice);
}

// ---------- 비밀번호 찾기 / 재설정 ----------

// #endregion

// #region 인증 — 비밀번호 찾기 · 재설정

export async function pageForgotPassword(request, env, error, notice) {
  const lang = getLang(request);
  const L = t(lang);
  return html(layout({
    title: L.forgotPasswordHeading, user: null, lang, body: `
    <div class="card" style="max-width:400px;margin:60px auto;">
      <h2 style="margin-top:0;">${escapeHtml(L.forgotPasswordHeading)}</h2>
      <p class="muted">${escapeHtml(L.forgotPasswordNotice)}</p>
      ${notice ? `<p class="muted">${escapeHtml(notice)}</p>` : ""}
      <form method="post" action="/forgot-password">
        <label>${escapeHtml(L.username)} (${escapeHtml(L.emailLabel)})</label>
        <input name="username" type="email" required autofocus>
        ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.sendResetLink)}</button></div>
      </form>
      <p class="muted" style="margin-top:14px;"><a href="/login">${escapeHtml(L.backToLogin)}</a></p>
    </div>` }));
}

export async function handleForgotPasswordPost(request, env) {
  const lang = getLang(request);
  const L = t(lang);
  const form = await request.formData();
  const username = String(form.get("username") || "").trim().toLowerCase();

  if (username) {
    const user = await env.DB.prepare(`SELECT id FROM techops_users WHERE username = ?`).bind(username).first();
    if (user) {
      const token = randomToken(48);
      const now = new Date();
      const expires = new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60000).toISOString().replace("Z", "");
      await env.DB.prepare(
        `INSERT INTO techops_password_resets (token, user_id, expires_at) VALUES (?, ?, ?)`
      ).bind(token, user.id, expires).run();

      const origin = new URL(request.url).origin;
      const resetUrl = `${origin}/reset-password?token=${token}`;
      const sent = await sendResetEmail(env, username, lang, resetUrl);
      if (!sent) {
        // 발송 실패는 서버 로그로만 남기고, 사용자에게는 계정 존재 여부가 드러나지 않도록
        // 아래의 동일한 안내 메시지를 그대로 보여준다 (사용자 열거 공격 방지).
        console.log(`reset email send failed for ${username}`);
      }
    }
  }

  // 계정 존재 여부/발송 성공 여부와 관계없이 항상 동일한 메시지 표시 (사용자 열거 공격 방지)
  return pageForgotPassword(request, env, null, L.resetLinkSentNotice);
}

export async function pageResetPassword(request, env, error) {
  const lang = getLang(request);
  const L = t(lang);
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  const row = token ? await env.DB.prepare(
    `SELECT token, expires_at, used_at FROM techops_password_resets WHERE token = ?`
  ).bind(token).first() : null;
  const valid = row && !row.used_at && new Date(row.expires_at + "Z") > new Date();

  if (!valid) {
    return html(layout({ title: L.resetPasswordHeading, user: null, lang, body: `
      <div class="card" style="max-width:400px;margin:60px auto;">
        <div class="err">${escapeHtml(L.resetInvalidToken)}</div>
        <p class="muted" style="margin-top:14px;"><a href="/forgot-password">${escapeHtml(L.forgotPassword)}</a></p>
      </div>` }), 400);
  }

  return html(layout({
    title: L.resetPasswordHeading, user: null, lang, body: `
    <div class="card" style="max-width:400px;margin:60px auto;">
      <h2 style="margin-top:0;">${escapeHtml(L.resetPasswordHeading)}</h2>
      <form method="post" action="/reset-password">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <label>${escapeHtml(L.newPassword)}</label>
        <input name="password" type="password" required minlength="8" autofocus>
        ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.resetBtn)}</button></div>
      </form>
    </div>` }));
}

export async function handleResetPasswordPost(request, env) {
  const lang = getLang(request);
  const L = t(lang);
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const password = String(form.get("password") || "");

  const row = token ? await env.DB.prepare(
    `SELECT token, user_id, expires_at, used_at FROM techops_password_resets WHERE token = ?`
  ).bind(token).first() : null;
  const valid = row && !row.used_at && new Date(row.expires_at + "Z") > new Date();

  if (!valid) {
    return html(layout({ title: L.resetPasswordHeading, user: null, lang, body: `
      <div class="card" style="max-width:400px;margin:60px auto;">
        <div class="err">${escapeHtml(L.resetInvalidToken)}</div>
        <p class="muted" style="margin-top:14px;"><a href="/forgot-password">${escapeHtml(L.forgotPassword)}</a></p>
      </div>` }), 400);
  }

  if (password.length < 8) {
    return pageResetPassword(request, env, L.checkInput);
  }

  const { salt, hash } = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE techops_users SET password_hash = ?, password_salt = ? WHERE id = ?`
    ).bind(hash, salt, row.user_id),
    env.DB.prepare(`UPDATE techops_password_resets SET used_at = datetime('now') WHERE token = ?`).bind(token),
    env.DB.prepare(`DELETE FROM techops_password_resets WHERE user_id = ? AND token != ?`).bind(row.user_id, token),
    // 비밀번호를 재설정하면 탈취됐을 수 있는 기존 로그인 세션을 모두 무효화한다.
    env.DB.prepare(`DELETE FROM techops_sessions WHERE user_id = ?`).bind(row.user_id),
    env.DB.prepare(
      `DELETE FROM techops_login_attempts WHERE username = (SELECT username FROM techops_users WHERE id = ?)`
    ).bind(row.user_id),
  ]);

  return redirect("/login?reset=1");
}

// #endregion

// #region 최초 관리자 설정 (/setup)

export async function pageSetup(request, env, error) {
  const lang = getLang(request);
  const L = t(lang);
  const { count } = await env.DB.prepare(`SELECT COUNT(*) as count FROM techops_users`).first();
  if (count > 0) {
    return html(layout({ title: L.setupDoneTitle, user: null, lang, body: `
      <div class="card"><p>${escapeHtml(L.adminExists)} <a href="/login">${escapeHtml(L.goToLogin)}</a></p></div>` }), 403);
  }
  return html(layout({
    title: L.initialSetupTitle, user: null, lang, body: `
    <div class="card" style="max-width:400px;margin:60px auto;">
      <h2 style="margin-top:0;">${escapeHtml(L.createAdminHeading)}</h2>
      <p class="muted">${escapeHtml(L.setupOnlyNotice)}</p>
      <form method="post" action="/setup">
        <label>${escapeHtml(L.setupToken)}</label>
        <input name="setup_token" required>
        <label>${escapeHtml(L.adminUsername)}</label>
        <input name="username" required>
        <label>${escapeHtml(L.displayName)}</label>
        <input name="display_name" required>
        <label>${escapeHtml(L.password)}</label>
        <input name="password" type="password" required minlength="8">
        ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.createAdminBtn)}</button></div>
      </form>
    </div>` }));
}

export async function handleSetupPost(request, env) {
  const lang = getLang(request);
  const L = t(lang);
  const { count } = await env.DB.prepare(`SELECT COUNT(*) as count FROM techops_users`).first();
  if (count > 0) return pageSetup(request, env, null);

  const form = await request.formData();
  const setupToken = String(form.get("setup_token") || "");
  const username = String(form.get("username") || "").trim();
  const displayName = String(form.get("display_name") || "").trim();
  const password = String(form.get("password") || "");

  if (!env.SETUP_TOKEN || setupToken !== env.SETUP_TOKEN) {
    return pageSetup(request, env, L.invalidSetupToken);
  }
  if (!username || !displayName || password.length < 8) {
    return pageSetup(request, env, L.checkInput);
  }

  const { salt, hash } = await hashPassword(password);
  await env.DB.prepare(
    `INSERT INTO techops_users (username, password_hash, password_salt, display_name, role, email_verified_at) VALUES (?, ?, ?, ?, 'admin', datetime('now'))`
  ).bind(username, hash, salt, displayName).run();

  return redirect("/login");
}

export async function handleChangePassword(request, env, user) {
  const form = await request.formData();
  const newPassword = String(form.get("new_password") || "");
  const confirmPassword = String(form.get("confirm_password") || "");
  const lang = getLang(request);
  if (!newPassword || newPassword.length < 8) {
    const msg = lang === "vi" ? "Mật khẩu mới phải có ít nhất 8 ký tự." : (lang === "en" ? "Password must be at least 8 characters." : "비밀번호는 8자 이상이어야 합니다.");
    return json({ error: msg }, 400);
  }
  if (newPassword !== confirmPassword) {
    const msg = lang === "vi" ? "Xác nhận mật khẩu không khớp." : (lang === "en" ? "Passwords do not match." : "비밀번호가 일치하지 않습니다.");
    return json({ error: msg }, 400);
  }
  const { salt, hash } = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE techops_users SET password_hash = ?, password_salt = ? WHERE id = ?")
    .bind(hash, salt, user.id).run();
  const msg = lang === "vi" ? "Đổi mật khẩu thành công!" : (lang === "en" ? "Password changed successfully!" : "비밀번호가 변경되었습니다.");
  return json({ success: true, message: msg });
}
