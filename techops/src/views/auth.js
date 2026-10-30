/**
 * Auth Views — HTML templates for Login, Signup, Reset Password, Setup
 */

import { escapeHtml } from "../utils/helpers.js";
import { layout } from "./layout.js";
import { t } from "../i18n/index.js";
import { SIGNUP_EMAIL_DOMAIN } from "../utils/helpers.js";

export function renderLoginView({ notice, error, lang }) {
  const L = t(lang);
  return layout({
    title: L.login,
    user: null,
    lang,
    body: `
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
    </div>`,
  });
}

export function renderSignupView({ notice, error, lang }) {
  const L = t(lang);
  return layout({
    title: L.signupHeading,
    user: null,
    lang,
    body: `
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
    </div>`,
  });
}

export function renderVerifyEmailInvalidView({ lang }) {
  const L = t(lang);
  return layout({
    title: L.verifyEmailHeading,
    user: null,
    lang,
    body: `
      <div class="card" style="max-width:400px;margin:60px auto;">
        <div class="err">${escapeHtml(L.verifyInvalidToken)}</div>
        <p class="muted" style="margin-top:14px;"><a href="/resend-verification">${escapeHtml(L.resendVerification)}</a></p>
      </div>`,
  });
}

export function renderResendVerificationView({ notice, error, lang }) {
  const L = t(lang);
  return layout({
    title: L.resendVerificationHeading,
    user: null,
    lang,
    body: `
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
    </div>`,
  });
}

export function renderForgotPasswordView({ notice, error, lang }) {
  const L = t(lang);
  return layout({
    title: L.forgotPasswordHeading,
    user: null,
    lang,
    body: `
    <div class="card" style="max-width:400px;margin:60px auto;">
      <h2 style="margin-top:0;">${escapeHtml(L.forgotPasswordHeading)}</h2>
      <p class="muted">${escapeHtml(L.forgotPasswordNotice)}</p>
      ${notice ? `<p class="muted">${escapeHtml(notice)}</p>` : ""}
      <form method="post" action="/forgot-password">
        <label>${escapeHtml(L.username)} (${escapeHtml(L.emailLabel)})</label>
        <input name="username" type="email" required autofocus>
        ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.forgotPasswordBtn)}</button></div>
      </form>
      <p class="muted" style="margin-top:14px;"><a href="/login">${escapeHtml(L.backToLogin)}</a></p>
    </div>`,
  });
}

export function renderResetPasswordView({ token, error, lang }) {
  const L = t(lang);
  return layout({
    title: L.resetPasswordHeading,
    user: null,
    lang,
    body: `
    <div class="card" style="max-width:400px;margin:60px auto;">
      <h2 style="margin-top:0;">${escapeHtml(L.resetPasswordHeading)}</h2>
      <form method="post" action="/reset-password">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <label>${escapeHtml(L.newPassword)}</label>
        <input name="password" type="password" required minlength="8" autofocus>
        ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
        <div style="margin-top:16px;"><button type="submit">${escapeHtml(L.resetBtn)}</button></div>
      </form>
    </div>`,
  });
}

export function renderResetPasswordInvalidView({ lang }) {
  const L = t(lang);
  return layout({
    title: L.resetPasswordHeading,
    user: null,
    lang,
    body: `
      <div class="card" style="max-width:400px;margin:60px auto;">
        <div class="err">${escapeHtml(L.resetInvalidToken)}</div>
        <p class="muted" style="margin-top:14px;"><a href="/forgot-password">${escapeHtml(L.forgotPassword)}</a></p>
      </div>`,
  });
}

export function renderSetupDoneView({ lang }) {
  const L = t(lang);
  return layout({
    title: L.setupDoneTitle,
    user: null,
    lang,
    body: `
      <div class="card"><p>${escapeHtml(L.adminExists)} <a href="/login">${escapeHtml(L.goToLogin)}</a></p></div>`,
  });
}

export function renderSetupView({ error, lang }) {
  const L = t(lang);
  return layout({
    title: L.initialSetupTitle,
    user: null,
    lang,
    body: `
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
    </div>`,
  });
}

