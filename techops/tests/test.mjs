import { read as readXlsx, utils as xlsxUtils, write as writeXlsx } from "xlsx/xlsx.mjs";
import { buildTrackerReportRows, summarizeRunMetadata, summarizeSeeLotWorkbook, trackerReportText, trackerWords } from "../src/modules/lot/lot-tracker.js";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import worker from "../worker.js";
import { testUserManagement } from "./test-user-management.mjs";
import { testLotSteps } from "./test-lot-steps.mjs";
import { testTranslationEfficiency } from "./test-translation.mjs";
import { testNewFeatures } from "./test-new-features.mjs";
import { fieldCsv, parseFieldCsv } from "../src/modules/daily/daily-field-csv.js";
import { DAILY_CLASSIFICATION_FIELDS, DAILY_CLASSIFICATION_ROWS } from "../src/config/daily-config.js";

const db = new DatabaseSync(":memory:");
db.exec(fs.readFileSync("./database/schema.sql", "utf8"));

class D1Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...args) { this.params = args; return this; }
  async first() {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params);
    return row === undefined ? null : row;
  }
  async all() {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...this.params);
    return { results: rows };
  }
  async run() {
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...this.params);
    return { meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
  }
}
class D1Shim {
  constructor(db) { this.db = db; }
  prepare(sql) { return new D1Stmt(this.db, sql); }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}

const env = { DB: new D1Shim(db), SETUP_TOKEN: "test-secret-token" };
const allowedOfficeIpHeaders = {
  "content-type": "application/x-www-form-urlencoded",
  "CF-Connecting-IP": "14.241.73.189",
};

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`OK   ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}

function extractCookie(res) {
  const sc = res.headers.get("set-cookie") || "";
  const m = sc.match(/session=([^;]+)/);
  return m ? m[1] : null;
}

async function main() {
  const release = JSON.parse(fs.readFileSync("./package.json", "utf8")).version;
  let versionResponse = await worker.fetch(new Request("https://x/api/version"), {}, {});
  const localVersion = await versionResponse.json();
  check("version endpoint needs neither login nor database and does not invent deployment metadata", localVersion.version === release && localVersion.deploymentId === null && localVersion.createdAt === null && versionResponse.headers.get("cache-control") === "no-store");
  const metadata = { id: "test-worker-version-1234", timestamp: "2026-09-12T01:00:00Z", tag: "private-tag" };
  versionResponse = await worker.fetch(new Request("https://x/api/version"), { CF_VERSION_METADATA: metadata, SECRET: "must-not-leak" }, {});
  const deployedVersion = await versionResponse.json();
  check("version endpoint reports current Worker metadata with a minimal public payload", deployedVersion.version === release && deployedVersion.deploymentId === metadata.id && deployedVersion.createdAt === metadata.timestamp && Object.keys(deployedVersion).length === 3);
  // 1) 계정 없을 때 /setup GET -> 폼 노출
  let res = await worker.fetch(new Request("https://x/setup"), env, {});
  let text = await res.text();
  check("setup GET shows form when no users", res.status === 200 && text.includes("관리자 계정 생성"));
  check("shared layout displays release version and loads deployment identity", text.includes(`v${release}`) && text.includes('id="deployment-id"') && text.includes("fetch('/api/version'"));
  check("HTML responses include baseline security headers",
    res.headers.get("x-content-type-options") === "nosniff"
      && res.headers.get("x-frame-options") === "DENY"
      && !!res.headers.get("content-security-policy"));

  // 교차 출처의 브라우저 POST는 상태 변경 전에 거부
  res = await worker.fetch(new Request("https://x/setup", {
    method: "POST",
    body: new URLSearchParams({ setup_token: "test-secret-token", username: "attacker", display_name: "공격자", password: "attackerpass1" }),
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
  }), env, {});
  check("cross-origin mutation is rejected", res.status === 403);

  // 2) 잘못된 SETUP_TOKEN
  res = await worker.fetch(new Request("https://x/setup", {
    method: "POST",
    body: new URLSearchParams({ setup_token: "wrong", username: "admin", display_name: "관리자", password: "adminpass1" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }), env, {});
  text = await res.text();
  check("setup POST rejects wrong token", text.includes("SETUP_TOKEN이 올바르지 않습니다"));

  const { count: c0 } = db.prepare("SELECT COUNT(*) as count FROM techops_users").get();
  check("no user created after wrong token", c0 === 0);

  // 3) 올바른 토큰으로 관리자 생성
  res = await worker.fetch(new Request("https://x/setup", {
    method: "POST",
    body: new URLSearchParams({ setup_token: "test-secret-token", username: "admin", display_name: "관리자", password: "adminpass1" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }), env, {});
  check("setup POST redirects on success", res.status === 302 && res.headers.get("location") === "/login");

  const { count: c1 } = db.prepare("SELECT COUNT(*) as count FROM techops_users").get();
  check("exactly 1 user after setup", c1 === 1);

  // 4) /setup 재접근 시 잠김
  res = await worker.fetch(new Request("https://x/setup"), env, {});
  check("setup locked after first admin", res.status === 403);

  // 5) 잘못된 비밀번호 로그인 (5회 잠금 확인)
  for (let i = 0; i < 5; i++) {
    res = await worker.fetch(new Request("https://x/login", {
      method: "POST",
      body: new URLSearchParams({ username: "admin", password: "wrongpass" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }), env, {});
  }
  const attempt = db.prepare("SELECT * FROM techops_login_attempts WHERE username='admin'").get();
  check("fail_count reached 5", attempt.fail_count === 5);
  check("locked_until set after 5 fails", !!attempt.locked_until);

  // 6) 잠긴 상태에서는 올바른 비밀번호도 거부
  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "admin", password: "adminpass1" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }), env, {});
  text = await res.text();
  check("login rejected while locked even with correct password", text.includes("로그인 시도가 너무 많습니다"));

  // 잠금 해제 (테스트용으로 직접 리셋)
  db.prepare("DELETE FROM techops_login_attempts WHERE username='admin'").run();

  // 7) 정상 로그인 -> 세션 쿠키 발급
  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "admin", password: "adminpass1" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }), env, {});
  const cookie = extractCookie(res);
  check("login success issues session cookie", res.status === 302 && res.headers.get("location") === "/daily-reports" && !!cookie);

  const authHeaders = { cookie: `session=${cookie}` };

  // 8) 기본 진입은 일일업무 조회, 평가업무는 /tasks에서 유지
  res = await worker.fetch(new Request("https://x/", { headers: authHeaders }), env, {});
  check("authenticated root redirects to daily reports", res.status === 302 && res.headers.get("location") === "/daily-reports");

  res = await worker.fetch(new Request("https://x/tasks", { headers: authHeaders }), env, {});
  text = await res.text();
  check("task dashboard remains available with the expanded sidebar",
    res.status === 200
      && text.includes('src="/evaluation/app?section=overview')
      && text.indexOf('href="/daily-reports"') < text.indexOf('href="/tasks"')
      && text.includes("전수분석 현황보고")
      && text.includes("기준정보 관리현황")
      && text.includes('href="/admin/users"')
      && text.includes('<div class="page-tools no-print">')
      && text.includes('<span class="account-info">관리자 (관리자)</span>')
      && !text.includes('class="sidebar-bottom"'));

  const fullAnalysisPage = await worker.fetch(new Request("https://x/full-analysis-reports", { headers: authHeaders }), env, {});
  check("remaining placeholder sidebar destination renders without broken links",
    fullAnalysisPage.status === 200 && (await fullAnalysisPage.text()).includes("전수분석 현황보고"));

  const masterDataStatusRedirect = await worker.fetch(new Request("https://x/master-data-status", { headers: authHeaders }), env, {});
  check("old master-data-status placeholder now redirects to the real /master module",
    masterDataStatusRedirect.status === 302 && masterDataStatusRedirect.headers.get("location") === "/master");

  // 9) 세션 없이 대시보드 접근 -> 로그인으로 리다이렉트
  res = await worker.fetch(new Request("https://x/"), env, {});
  check("dashboard redirects to /login without session", res.status === 302 && res.headers.get("location") === "/login");

  // 10) 업무 생성
  res = await worker.fetch(new Request("https://x/tasks/new", {
    method: "POST",
    body: new URLSearchParams({ title: "ATE 저수율 원인 분석", description: "W35 저수율 원인 분석", priority: "상", owner: "이재현", due_date: "2026-09-05" }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...authHeaders },
  }), env, {});
  check("task create redirects to /tasks", res.status === 302 && res.headers.get("location") === "/tasks");

  const task = db.prepare("SELECT * FROM tech_task WHERE title=?").get("ATE 저수율 원인 분석");
  check("task row created", !!task);
  check("new task has no completed_at", task.completed_at === null);

  // 11) 업무 상세 페이지
  res = await worker.fetch(new Request(`https://x/tasks/${task.id}`, { headers: authHeaders }), env, {});
  text = await res.text();
  check("task detail page renders title", res.status === 200 && text.includes("ATE 저수율 원인 분석"));

  // 12) 진행현황 추가
  res = await worker.fetch(new Request(`https://x/tasks/${task.id}/updates`, {
    method: "POST",
    body: new URLSearchParams({ content: "1차 분석 완료, 원인 후보 3건 도출" }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...authHeaders },
  }), env, {});
  check("update add redirects to task detail", res.status === 302 && res.headers.get("location") === `/tasks/${task.id}`);

  const upd = db.prepare("SELECT * FROM tech_update WHERE task_id=?").get(task.id);
  check("tech_update row created", !!upd && upd.content.includes("1차 분석"));

  // 13) 상태를 완료로 변경 -> completed_at 자동 세팅
  res = await worker.fetch(new Request(`https://x/tasks/${task.id}/update`, {
    method: "POST",
    body: new URLSearchParams({ status: "완료", priority: "상", owner: "이재현", due_date: "2026-09-05" }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...authHeaders },
  }), env, {});
  const taskAfter = db.prepare("SELECT * FROM tech_task WHERE id=?").get(task.id);
  check("status update to 완료 succeeds", res.status === 302);
  check("completed_at auto-set when status=완료", !!taskAfter.completed_at);

  // 14) 다시 검토중으로 되돌리면 completed_at 초기화
  res = await worker.fetch(new Request(`https://x/tasks/${task.id}/update`, {
    method: "POST",
    body: new URLSearchParams({ status: "검토중", priority: "상", owner: "이재현", due_date: "2026-09-05" }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...authHeaders },
  }), env, {});
  const taskAfter2 = db.prepare("SELECT * FROM tech_task WHERE id=?").get(task.id);
  check("completed_at cleared when status reverts", taskAfter2.completed_at === null);

  // 15) CHECK 제약 직접 위반 시도 (완료인데 completed_at NULL) -> DB 레벨에서 거부되어야 함
  let threw = false;
  try {
    db.prepare("UPDATE tech_task SET status='완료', completed_at=NULL WHERE id=?").run(task.id);
  } catch (e) {
    threw = true;
  }
  check("DB CHECK constraint blocks 완료 without completed_at", threw);

  // 16) API: 업무 목록 JSON
  res = await worker.fetch(new Request("https://x/api/tasks", { headers: authHeaders }), env, {});
  const apiJson = await res.json();
  check("api/tasks returns task list", res.status === 200 && Array.isArray(apiJson.tasks) && apiJson.tasks.length >= 1);

  // 17) 보고 이력 생성/조회
  res = await worker.fetch(new Request("https://x/api/reports", {
    method: "POST",
    body: JSON.stringify({ report_type: "weekly", period_start: "2026-08-24", period_end: "2026-08-28", content: "주간 보고 테스트" }),
    headers: { "content-type": "application/json", ...authHeaders },
  }), env, {});
  check("report create returns 201", res.status === 201);

  res = await worker.fetch(new Request("https://x/api/reports", { headers: authHeaders }), env, {});
  const reportsJson = await res.json();
  check("report list includes created report", reportsJson.reports.some(r => r.content === "주간 보고 테스트"));

  // 18) 로그아웃은 POST만 허용하고 세션 무효화
  res = await worker.fetch(new Request("https://x/logout", { headers: authHeaders }), env, {});
  check("logout rejects GET", res.status === 405);
  res = await worker.fetch(new Request("https://x/logout", { method: "POST", headers: authHeaders }), env, {});
  const sessionRow = db.prepare("SELECT * FROM techops_sessions WHERE id=?").get(cookie);
  check("session deleted after logout", res.status === 302 && !sessionRow);

  // 19) 허용되지 않은 도메인으로 회원가입 거부
  res = await worker.fetch(new Request("https://x/signup", {
    method: "POST",
    body: new URLSearchParams({ username: "someone@gmail.com", display_name: "테스트", password: "memberpass1" }),
    headers: allowedOfficeIpHeaders,
  }), env, {});
  text = await res.text();
  check("signup rejects non-company domain", text.includes("hanyangdgtvina.com"));
  const notCreated = db.prepare("SELECT id FROM techops_users WHERE username='someone@gmail.com'").get();
  check("no user created for disallowed domain", !notCreated);

  // 20) 허용된 도메인으로 회원가입 성공 (즉시 가입, role=member)
  res = await worker.fetch(new Request("https://x/signup", {
    method: "POST",
    body: new URLSearchParams({ username: "member1@hanyangdgtvina.com", display_name: "직원1", password: "memberpass1" }),
    headers: allowedOfficeIpHeaders,
  }), env, {});
  check("signup redirects on success", res.status === 302 && res.headers.get("location") === "/login?signup=1");
  const memberRow = db.prepare("SELECT role FROM techops_users WHERE username='member1@hanyangdgtvina.com'").get();
  check("new signup has role=member", memberRow && memberRow.role === "member");

  // 21) 동일 아이디 중복 가입 거부
  res = await worker.fetch(new Request("https://x/signup", {
    method: "POST",
    body: new URLSearchParams({ username: "member1@hanyangdgtvina.com", display_name: "직원1중복", password: "memberpass1" }),
    headers: allowedOfficeIpHeaders,
  }), env, {});
  text = await res.text();
  check("duplicate signup rejected", text.includes("이미 사용 중인 아이디입니다"));

  // 22) 비밀번호 찾기: 존재하는/존재하지 않는 계정 모두 동일한 안내 메시지 (사용자 열거 방지)
  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "member1@hanyangdgtvina.com", password: "memberpass1" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }), env, {});
  text = await res.text();
  check("member login is rejected outside the allowed office IP", text.includes("허용되지 않은 네트워크"));

  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "member1@hanyangdgtvina.com", password: "memberpass1" }),
    headers: allowedOfficeIpHeaders,
  }), env, {});
  const memberSessionBeforeReset = extractCookie(res);
  check("member has an active session before password reset", !!memberSessionBeforeReset);

  res = await worker.fetch(new Request("https://x/forgot-password", {
    method: "POST",
    body: new URLSearchParams({ username: "member1@hanyangdgtvina.com" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }), env, {});
  const existsText = await res.text();
  res = await worker.fetch(new Request("https://x/forgot-password", {
    method: "POST",
    body: new URLSearchParams({ username: "noone@hanyangdgtvina.com" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }), env, {});
  const notExistsText = await res.text();
  check("forgot-password shows same generic notice regardless of account existence",
    existsText.includes("재설정 링크를 보내드렸습니다") && notExistsText.includes("재설정 링크를 보내드렸습니다"));

  const resetRow = db.prepare(
    "SELECT pr.token, pr.expires_at, pr.used_at FROM techops_password_resets pr JOIN techops_users u ON u.id = pr.user_id WHERE u.username='member1@hanyangdgtvina.com'"
  ).get();
  check("reset token created only for existing account", !!resetRow);
  const noTokenForGhost = db.prepare(
    "SELECT pr.token FROM techops_password_resets pr JOIN techops_users u ON u.id = pr.user_id WHERE u.username='noone@hanyangdgtvina.com'"
  ).get();
  check("no reset token created for nonexistent account", !noTokenForGhost);

  // 23) 잘못된/없는 토큰으로 재설정 페이지 접근 거부
  res = await worker.fetch(new Request("https://x/reset-password?token=bogus-token"), env, {});
  check("reset-password with bogus token rejected", res.status === 400);

  // 24) 정상 토큰으로 비밀번호 재설정 후 새 비밀번호로 로그인 성공
  res = await worker.fetch(new Request(`https://x/reset-password?token=${resetRow.token}`), env, {});
  check("reset-password with valid token shows form", res.status === 200);

  res = await worker.fetch(new Request("https://x/reset-password", {
    method: "POST",
    body: new URLSearchParams({ token: resetRow.token, password: "newmemberpass1" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }), env, {});
  check("reset-password POST redirects on success", res.status === 302 && res.headers.get("location") === "/login?reset=1");
  const oldMemberSession = db.prepare("SELECT id FROM techops_sessions WHERE id=?").get(memberSessionBeforeReset);
  check("password reset revokes existing sessions", !oldMemberSession);

  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "member1@hanyangdgtvina.com", password: "newmemberpass1" }),
    headers: allowedOfficeIpHeaders,
  }), env, {});
  check("login succeeds with new password after reset", res.status === 302 && res.headers.get("location") === "/daily-reports");

  // 25) 사용된 토큰 재사용 불가
  res = await worker.fetch(new Request(`https://x/reset-password?token=${resetRow.token}`), env, {});
  check("used reset token cannot be reused", res.status === 400);

  // 26) RESEND_API_KEY가 설정된 경우: 회원가입은 이메일 인증 완료 전까지 로그인 불가
  const realFetch = globalThis.fetch;
  let lastEmailPayload = null;
  globalThis.fetch = async (url, opts) => {
    lastEmailPayload = { url, body: JSON.parse(opts.body) };
    return { ok: true };
  };
  const envWithEmail = { ...env, RESEND_API_KEY: "test-resend-key" };

  res = await worker.fetch(new Request("https://x/signup", {
    method: "POST",
    body: new URLSearchParams({ username: "member2@hanyangdgtvina.com", display_name: "직원2", password: "memberpass2" }),
    headers: allowedOfficeIpHeaders,
  }), envWithEmail, {});
  check("signup with RESEND_API_KEY redirects to verify notice", res.status === 302 && res.headers.get("location") === "/login?verify=1");
  check("verification email was sent via Resend API", lastEmailPayload && lastEmailPayload.url === "https://api.resend.com/emails" && lastEmailPayload.body.to.includes("member2@hanyangdgtvina.com"));

  const unverifiedRow = db.prepare("SELECT id, email_verified_at FROM techops_users WHERE username='member2@hanyangdgtvina.com'").get();
  check("new signup is unverified when RESEND_API_KEY is set", unverifiedRow && !unverifiedRow.email_verified_at);

  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "member2@hanyangdgtvina.com", password: "memberpass2" }),
    headers: allowedOfficeIpHeaders,
  }), envWithEmail, {});
  text = await res.text();
  check("login blocked before email verification", res.status === 200 && text.includes("관리자 승인 또는 이메일 인증"));

  const attemptAfterUnverified = db.prepare("SELECT * FROM techops_login_attempts WHERE username='member2@hanyangdgtvina.com'").get();
  check("unverified-but-correct-password login is not counted as a failed attempt", !attemptAfterUnverified);

  const verifyRow = db.prepare(
    "SELECT ev.token FROM techops_email_verifications ev JOIN techops_users u ON u.id = ev.user_id WHERE u.username='member2@hanyangdgtvina.com'"
  ).get();
  check("verification token was created", !!verifyRow);

  res = await worker.fetch(new Request(`https://x/verify-email?token=bogus`), envWithEmail, {});
  check("verify-email with bogus token rejected", res.status === 400);

  res = await worker.fetch(new Request(`https://x/verify-email?token=${verifyRow.token}`), envWithEmail, {});
  check("verify-email with valid token redirects to login", res.status === 302 && res.headers.get("location") === "/login?verified=1");

  const verifiedRow = db.prepare("SELECT email_verified_at FROM techops_users WHERE username='member2@hanyangdgtvina.com'").get();
  check("account is verified after clicking the link", !!verifiedRow.email_verified_at);

  res = await worker.fetch(new Request(`https://x/verify-email?token=${verifyRow.token}`), envWithEmail, {});
  check("used verification token cannot be reused", res.status === 400);

  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "member2@hanyangdgtvina.com", password: "memberpass2" }),
    headers: allowedOfficeIpHeaders,
  }), envWithEmail, {});
  check("login succeeds after email verification", res.status === 302 && res.headers.get("location") === "/daily-reports");
  const member2Cookie = extractCookie(res);

  globalThis.fetch = realFetch;

  // 27) 관리자 전용 동적 필드와 일일업무 저장 흐름
  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "admin", password: "adminpass1" }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }), env, {});
  const adminCookie2 = extractCookie(res);
  const adminHeaders2 = { cookie: `session=${adminCookie2}` };

  db.prepare("UPDATE techops_users SET email_verified_at=NULL WHERE username='member2@hanyangdgtvina.com'").run();
  const memberApprovalRow = db.prepare("SELECT id FROM techops_users WHERE username='member2@hanyangdgtvina.com'").get();
  const memberAdminPage = await worker.fetch(new Request("https://x/admin/users", {
    headers: { cookie: `session=${member2Cookie}` },
  }), env, {});
  const memberFieldsPage = await worker.fetch(new Request("https://x/daily-fields", {
    headers: { cookie: `session=${member2Cookie}` },
  }), env, {});
  check("member cannot access administration pages", memberAdminPage.status === 403 && memberFieldsPage.status === 403);

  res = await worker.fetch(new Request("https://x/admin/users", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("user management page lists all accounts including pending ones",
    res.status === 200
      && text.includes("사용자 관리")
      && text.includes("member2@hanyangdgtvina.com")
      && text.includes("대기중")
      && text.includes(`/admin/users/${memberApprovalRow.id}/approve`));
  check("user management marks pending accounts and shows role and status as badges",
    text.includes('<main class="daily-work-page users-page">')
      && text.includes('<table class="data-table user-table">')
      && text.includes('<tr class="is-pending">')
      && text.includes('<span class="status-pill warn">대기중</span>')
      && text.includes('<button type="submit" class="small primary">'));

  res = await worker.fetch(new Request(`https://x/admin/users/${memberApprovalRow.id}/approve`, {
    method: "POST",
    headers: adminHeaders2,
  }), env, {});
  const manuallyApprovedMember = db.prepare("SELECT email_verified_at FROM techops_users WHERE id=?").get(memberApprovalRow.id);
  check("admin can manually approve a pending member",
    res.status === 302
      && res.headers.get("location") === "/admin/users"
      && !!manuallyApprovedMember.email_verified_at);

  const protectedAdminId = db.prepare("SELECT id FROM techops_users WHERE username='admin'").get().id;
  res = await worker.fetch(new Request("https://x/admin/users", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("password reset control is shown for members but never for administrators",
    text.includes(`/admin/users/${memberApprovalRow.id}/password-reset`)
      && !text.includes(`/admin/users/${protectedAdminId}/password-reset`));
  res = await worker.fetch(new Request("https://x/admin/users", {
    headers: { cookie: `session=${adminCookie2}; lang=en` },
  }), env, {});
  text = await res.text();
  check("password reset confirmation remains valid with apostrophes in translated text",
    text.includes("Replace this member&#39;s password")
      && text.includes("return confirm(this.dataset.confirm)"));

  res = await worker.fetch(new Request(`https://x/admin/users/${memberApprovalRow.id}/password-reset`, {
    method: "POST",
    headers: { cookie: `session=${member2Cookie}` },
  }), env, {});
  check("members cannot reset passwords through the admin endpoint", res.status === 403);

  const adminHashBeforeProtectedReset = db.prepare("SELECT password_hash FROM techops_users WHERE id=?").get(protectedAdminId).password_hash;
  res = await worker.fetch(new Request(`https://x/admin/users/${protectedAdminId}/password-reset`, {
    method: "POST",
    headers: adminHeaders2,
  }), env, {});
  const adminHashAfterProtectedReset = db.prepare("SELECT password_hash FROM techops_users WHERE id=?").get(protectedAdminId).password_hash;
  check("administrator passwords cannot be viewed or reset by another administrator",
    res.status === 403 && adminHashAfterProtectedReset === adminHashBeforeProtectedReset);

  db.prepare("INSERT OR REPLACE INTO techops_login_attempts(username,fail_count,locked_until) VALUES(?,5,datetime('now','+15 minutes'))").run("member2@hanyangdgtvina.com");
  res = await worker.fetch(new Request(`https://x/admin/users/${memberApprovalRow.id}/password-reset`, {
    method: "POST",
    headers: adminHeaders2,
  }), env, {});
  text = await res.text();
  const temporaryPassword = text.match(/<code[^>]*>([^<]+)<\/code>/)?.[1];
  check("admin can issue a one-time displayed temporary password for a member",
    res.status === 200 && res.headers.get("cache-control") === "no-store"
      && /^Temp-[a-f0-9]{24}$/.test(temporaryPassword || "")
      && !db.prepare("SELECT 1 FROM techops_sessions WHERE user_id=?").get(memberApprovalRow.id)
      && !db.prepare("SELECT 1 FROM techops_login_attempts WHERE username=?").get("member2@hanyangdgtvina.com"));
  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "member2@hanyangdgtvina.com", password: temporaryPassword }),
    headers: allowedOfficeIpHeaders,
  }), env, {});
  check("member can log in with the administrator-issued temporary password",
    res.status === 302 && res.headers.get("location") === "/daily-reports" && !!extractCookie(res));

  // 28) 사용자 관리: 승격/강등/접근 차단 + 본인 계정 보호
  res = await worker.fetch(new Request(`https://x/admin/users/${memberApprovalRow.id}/promote`, {
    method: "POST",
    headers: adminHeaders2,
  }), env, {});
  const promotedMember = db.prepare("SELECT role FROM techops_users WHERE id=?").get(memberApprovalRow.id);
  check("admin can promote an approved member to admin",
    res.status === 302 && res.headers.get("location") === "/admin/users" && promotedMember.role === "admin");

  const originalAdminId = db.prepare("SELECT id FROM techops_users WHERE username='admin'").get().id;
  res = await worker.fetch(new Request(`https://x/admin/users/${originalAdminId}/demote`, {
    method: "POST",
    headers: adminHeaders2,
  }), env, {});
  const selfAfterDemoteAttempt = db.prepare("SELECT role FROM techops_users WHERE id=?").get(originalAdminId);
  check("admin cannot demote their own account",
    res.status === 302 && res.headers.get("location") === "/admin/users?blocked=self" && selfAfterDemoteAttempt.role === "admin");

  res = await worker.fetch(new Request(`https://x/admin/users/${originalAdminId}/revoke`, {
    method: "POST",
    headers: adminHeaders2,
  }), env, {});
  const selfAfterRevokeAttempt = db.prepare("SELECT email_verified_at FROM techops_users WHERE id=?").get(originalAdminId);
  check("admin cannot revoke their own access",
    res.status === 302 && res.headers.get("location") === "/admin/users?blocked=self" && !!selfAfterRevokeAttempt.email_verified_at);

  res = await worker.fetch(new Request(`https://x/admin/users/${memberApprovalRow.id}/demote`, {
    method: "POST",
    headers: adminHeaders2,
  }), env, {});
  const demotedMember = db.prepare("SELECT role FROM techops_users WHERE id=?").get(memberApprovalRow.id);
  check("admin can demote another admin back to member",
    res.status === 302 && res.headers.get("location") === "/admin/users" && demotedMember.role === "member");

  const sessionsBeforeRevoke = db.prepare("SELECT COUNT(*) as count FROM techops_sessions WHERE user_id=?").get(memberApprovalRow.id).count;
  check("target member has an active session before being revoked", sessionsBeforeRevoke > 0);

  res = await worker.fetch(new Request(`https://x/admin/users/${memberApprovalRow.id}/revoke`, {
    method: "POST",
    headers: adminHeaders2,
  }), env, {});
  const revokedMember = db.prepare("SELECT email_verified_at FROM techops_users WHERE id=?").get(memberApprovalRow.id);
  const sessionsAfterRevoke = db.prepare("SELECT COUNT(*) as count FROM techops_sessions WHERE user_id=?").get(memberApprovalRow.id).count;
  check("admin can revoke a member's access and their session is terminated immediately",
    res.status === 302 && res.headers.get("location") === "/admin/users" && !revokedMember.email_verified_at && sessionsAfterRevoke === 0);

  res = await worker.fetch(new Request("https://x/login", {
    method: "POST",
    body: new URLSearchParams({ username: "member2@hanyangdgtvina.com", password: temporaryPassword }),
    headers: allowedOfficeIpHeaders,
  }), env, {});
  text = await res.text();
  check("revoked member cannot log back in until re-approved", res.status === 200 && text.includes("관리자 승인 또는 이메일 인증"));

  res = await worker.fetch(new Request("https://x/daily-items/new", {
    method: "POST",
    body: new URLSearchParams({ part: "SSD", category: "평가", title: "보안 회귀 테스트", owner: "테스터" }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  const dailyItem = db.prepare("SELECT id,owner FROM tech_daily_item WHERE title=?").get("보안 회귀 테스트");
  check("daily item is created with the signed-in account name despite a forged owner field", res.status === 302 && !!dailyItem && dailyItem.owner === "관리자");

  const statusField = db.prepare("SELECT id FROM tech_daily_field WHERE label='상태'").get();
  const productField = db.prepare("SELECT id FROM tech_daily_field WHERE label='제품'").get();
  const processField = db.prepare("SELECT id FROM tech_daily_field WHERE label='진행중인 공정'").get();
  const quantityField = db.prepare("SELECT id FROM tech_daily_field WHERE label='수량'").get();
  const goodField = db.prepare("SELECT id FROM tech_daily_field WHERE label='양품 수량'").get();
  const defectField = db.prepare("SELECT id FROM tech_daily_field WHERE label='불량 수량'").get();
  const yieldField = db.prepare("SELECT id FROM tech_daily_field WHERE label='수율'").get();
  const statusOptionCountBefore = db.prepare("SELECT COUNT(*) AS count FROM tech_daily_field_option WHERE field_id=?").get(statusField.id).count;
  res = await worker.fetch(new Request(`https://x/daily-fields/${statusField.id}/options/new`, {
    method: "POST",
    body: new URLSearchParams({ value: "임의 상태" }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  const statusOptionCountAfter = db.prepare("SELECT COUNT(*) AS count FROM tech_daily_field_option WHERE field_id=?").get(statusField.id).count;
  check("managed status field rejects custom options",
    res.status === 302 && statusOptionCountAfter === statusOptionCountBefore);

  res = await worker.fetch(new Request(`https://x/daily-items/${dailyItem.id}/updates`, {
    method: "POST",
    body: new URLSearchParams({ report_date: "2026-02-30", [`field_${statusField.id}`]: "진행중" }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  check("invalid daily report date is rejected", res.status === 400);

  res = await worker.fetch(new Request(`https://x/daily-items/${dailyItem.id}/updates`, {
    method: "POST",
    body: new URLSearchParams({
      report_date: "2026-09-01",
      [`field_${statusField.id}`]: "IN_PROGRESS",
      [`field_${processField.id}`]: "Final Test",
      [`field_${quantityField.id}`]: "100",
      [`field_${goodField.id}`]: "98",
      [`field_${defectField.id}`]: "2",
      [`field_${yieldField.id}`]: "98.0%",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  const dailyUpdate = db.prepare("SELECT id FROM tech_daily_update WHERE item_id=?").get(dailyItem.id);
  const dailyValue = db.prepare("SELECT value FROM tech_daily_update_value WHERE update_id=? AND field_id=?").get(dailyUpdate.id, statusField.id);
  check("daily update stores the canonical status code", res.status === 302 && dailyValue?.value === "IN_PROGRESS");

  db.prepare("UPDATE tech_daily_update_value SET value='진행중', value_en='In Progress', value_vi='Đang tiến hành' WHERE update_id=? AND field_id=?")
    .run(dailyUpdate.id, statusField.id);
  const statusMigrationSql = fs.readFileSync("./database/migrations/status-code-migration.sql", "utf8");
  db.exec(statusMigrationSql);
  db.exec(statusMigrationSql);
  const migratedDailyStatus = db.prepare("SELECT value, value_en, value_vi FROM tech_daily_update_value WHERE update_id=? AND field_id=?")
    .get(dailyUpdate.id, statusField.id);
  const legacyStatusOptions = db.prepare(
    "SELECT COUNT(*) AS count FROM tech_daily_field_option WHERE field_id=? AND value IN ('대기','진행중','지연','이슈','보류','완료')"
  ).get(statusField.id);
  check("status migration is idempotent and removes language-specific source values",
    migratedDailyStatus.value === "IN_PROGRESS"
      && migratedDailyStatus.value_en === "IN_PROGRESS"
      && migratedDailyStatus.value_vi === "IN_PROGRESS"
      && legacyStatusOptions.count === 0);

  res = await worker.fetch(new Request("https://x/daily-reports?date=2026-09-01", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("daily report is the default daily-work view without the executive summary",
    res.status === 200
      && !text.includes("임원 보고 요약")
      && text.indexOf('href="/daily-reports"') < text.indexOf('href="/daily-items"')
      && text.includes('<main class="daily-work-page">')
      && text.includes('class="report-table live-report-table"')
      && text.includes("98.0%")
      && text.includes("진행 공정"));

  res = await worker.fetch(new Request("https://x/daily-reports?date=2026-09-01", {
    headers: { cookie: `session=${adminCookie2}; lang=vi` },
  }), env, {});
  text = await res.text();
  check("daily issue counts do not change with the display language",
    res.status === 200
      && text.includes("Cần kiểm tra ngay (0)")
      && text.includes("Đang tiến hành")
      && !text.includes("Cần kiểm tra ngay (1)"));

  res = await worker.fetch(new Request("https://x/daily-items", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("daily input list uses the same compact layout as daily reports",
    res.status === 200
      && text.includes('<main class="daily-work-page">')
      && text.includes("새 항목 등록")
      && text.includes("font-size:14px")
      && text.includes("padding:11px 14px"));
  check("daily input list shares the report toolbar, header band and status pills",
    text.includes('<form method="get" action="/daily-items" class="daily-filter">')
      && text.includes('<div class="daily-part-head"><h3>항목 목록</h3><span class="daily-count">')
      && /<td data-label="최근 상태"><span class="status-pill[^"]*">진행 중<\/span><\/td>/.test(text));
  check("daily report assignee is read-only and shows the signed-in account name",
    text.includes('value="관리자" readonly aria-readonly="true"') && !text.includes('name="owner"'));

  db.prepare("UPDATE tech_daily_item SET closed_at=datetime('now') WHERE id=?").run(dailyItem.id);
  res = await worker.fetch(new Request("https://x/daily-items", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("entry list hides closed tasks by default", !text.includes(`/daily-items/${dailyItem.id}\"`));
  res = await worker.fetch(new Request("https://x/daily-items?active=0", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("entry filter can include closed tasks", text.includes(`/daily-items/${dailyItem.id}\"`) && text.includes('value="0" selected'));
  db.prepare("UPDATE tech_daily_item SET closed_at=NULL WHERE id=?").run(dailyItem.id);

  res = await worker.fetch(new Request("https://x/daily-reports?date=2026-09-01&part=Module", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("empty report gives a writing path and excludes other teams' stale tasks",
    text.includes("아직 등록된 보고가 없습니다") && text.includes('class="daily-primary" href="/daily-items"')
      && !text.includes(`/daily-items/${dailyItem.id}\"`));
  res = await worker.fetch(new Request("https://x/daily-reports?date=2026-09-01&part=SSD", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("report overview precedes collapsed full data and follow-ups",
    text.includes('<details class="daily-technical">')
      && text.indexOf('<article class="daily-overview') < text.indexOf('<details class="daily-technical">')
      && text.indexOf('<details class="daily-technical">') < text.indexOf('id="daily-attention"')
      && text.includes("98.0%"));

  const fieldUpload = async (csv, confirm = false, headers = adminHeaders2) => {
    const form = new FormData();
    if (confirm) { form.set("csv", csv); form.set("confirm", "1"); }
    else form.set("file", new File([csv], "fields.csv"));
    return worker.fetch(new Request("https://x/daily-fields/import", { method: "POST", headers, body: form }), env, {});
  };
  res = await worker.fetch(new Request("https://x/daily-fields/export", { headers: adminHeaders2 }), env, {});
  const settingsCsv = await res.text();
  check("settings CSV exports field definitions and options", parseFieldCsv(settingsCsv).some(r => r[0] === "상태" && r[6] === "IN_PROGRESS"));
  const fieldCount = db.prepare("SELECT COUNT(*) n FROM tech_daily_field").get().n;
  res = await fieldUpload(settingsCsv, true);
  check("settings export can be reimported without duplicating fields", (await res.text()).includes("반영 완료") && db.prepare("SELECT COUNT(*) n FROM tech_daily_field").get().n === fieldCount);
  const newSettings = fieldCsv([
    ["CSV parent", "Parent", "Cha", "select", "9000", "", 'A,"1"', "10", ""],
    ["CSV child", "Child", "Con", "select", "9010", "CSV parent", "B", "10", 'A,"1"'],
  ]);
  res = await fieldUpload(newSettings);
  check("settings preview makes no DB changes", (await res.text()).includes("설정 반영") && !db.prepare("SELECT id FROM tech_daily_field WHERE label='CSV parent'").get());
  res = await fieldUpload(newSettings, true);
  check("settings import creates fields with cascading options atomically", (await res.text()).includes("반영 완료") && !!db.prepare("SELECT o.id FROM tech_daily_field_option o JOIN tech_daily_field f ON f.id=o.field_id WHERE f.label='CSV child' AND o.parent_option_id IS NOT NULL").get());
  await fieldUpload(newSettings, true);
  check("settings repeat import does not duplicate options", db.prepare("SELECT COUNT(*) n FROM tech_daily_field_option o JOIN tech_daily_field f ON f.id=o.field_id WHERE f.label='CSV child'").get().n === 1);
  const looseFieldId = Number(db.prepare("INSERT INTO tech_daily_field(label,input_type,sort_order) VALUES ('CSV loose','select',9020)").run().lastInsertRowid);
  db.prepare("INSERT INTO tech_daily_field_option(field_id,value,sort_order) VALUES (?,'B',10)").run(looseFieldId);
  const relinkSettings = fieldCsv([
    ["CSV parent", "Parent", "Cha", "select", "9000", "", 'A,"1"', "10", ""],
    ["CSV loose", "Loose", "Rời", "select", "9020", "CSV parent", "B", "10", 'A,"1"'],
  ]);
  res = await fieldUpload(relinkSettings, true);
  check("settings import can attach an existing field and its orphan option to a parent",
    (await res.text()).includes("반영 완료")
      && db.prepare("SELECT p.label FROM tech_daily_field f JOIN tech_daily_field p ON p.id=f.depends_on_field_id WHERE f.label='CSV loose'").get()?.label === "CSV parent"
      && db.prepare("SELECT COUNT(*) n FROM tech_daily_field_option o JOIN tech_daily_field f ON f.id=o.field_id WHERE f.label='CSV loose' AND o.parent_option_id IS NOT NULL").get().n === 1);

  const grandId = Number(db.prepare("INSERT INTO tech_daily_field(label,input_type,sort_order) VALUES ('CSV grand','select',9100)").run().lastInsertRowid);
  const grandOne = Number(db.prepare("INSERT INTO tech_daily_field_option(field_id,value,sort_order) VALUES (?,'G1',10)").run(grandId).lastInsertRowid);
  const grandTwo = Number(db.prepare("INSERT INTO tech_daily_field_option(field_id,value,sort_order) VALUES (?,'G2',20)").run(grandId).lastInsertRowid);
  const repeatedParentId = Number(db.prepare("INSERT INTO tech_daily_field(label,input_type,sort_order,depends_on_field_id) VALUES ('CSV repeated parent','select',9110,?)").run(grandId).lastInsertRowid);
  db.prepare("INSERT INTO tech_daily_field_option(field_id,value,sort_order,parent_option_id) VALUES (?,'A',10,?)").run(repeatedParentId, grandOne);
  db.prepare("INSERT INTO tech_daily_field_option(field_id,value,sort_order,parent_option_id) VALUES (?,'A',10,?)").run(repeatedParentId, grandTwo);
  const repeatedChildId = Number(db.prepare("INSERT INTO tech_daily_field(label,input_type,sort_order) VALUES ('CSV repeated child','select',9120)").run().lastInsertRowid);
  db.prepare("INSERT INTO tech_daily_field_option(field_id,value,sort_order) VALUES (?,'B',10)").run(repeatedChildId);
  const repeatedSettings = fieldCsv([
    ["CSV grand", "Grand", "Gốc", "select", "9100", "", "G1", "10", ""],
    ["CSV grand", "Grand", "Gốc", "select", "9100", "", "G2", "20", ""],
    ["CSV repeated parent", "Repeated parent", "Cha lặp", "select", "9110", "CSV grand", "A", "10", "G1"],
    ["CSV repeated parent", "Repeated parent", "Cha lặp", "select", "9110", "CSV grand", "A", "10", "G2"],
    ["CSV repeated child", "Repeated child", "Con lặp", "select", "9120", "CSV repeated parent", "B", "10", "A"],
  ]);
  res = await fieldUpload(repeatedSettings, true);
  check("settings import expands a child choice across repeated parent values",
    (await res.text()).includes("반영 완료")
      && db.prepare("SELECT COUNT(*) n FROM tech_daily_field_option o JOIN tech_daily_field f ON f.id=o.field_id WHERE f.label='CSV repeated child' AND o.value='B' AND o.parent_option_id IS NOT NULL").get().n === 2);
  res = await fieldUpload(fieldCsv([["bad parent", "", "", "select", "10", "missing", "", "", ""]]), true);
  check("invalid settings references reject all writes", (await res.text()).includes("파일 오류") && !db.prepare("SELECT id FROM tech_daily_field WHERE label='bad parent'").get());
  res = await fieldUpload(fieldCsv([["상태", "", "", "select", "120", "", "CUSTOM", "100", ""]]), true);
  check("CSV cannot add managed status choices", (await res.text()).includes("Managed status options"));
  res = await fieldUpload(newSettings, true, { ...adminHeaders2, origin: "https://evil.example" });
  check("settings CSV rejects cross-origin writes", res.status === 403);
  res = await worker.fetch(new Request("https://x/daily-fields/export"), env, {});
  check("settings CSV export requires login", res.status === 302);
  const optionField = db.prepare("SELECT id FROM tech_daily_field WHERE label='CSV parent'").get();
  db.prepare("INSERT INTO tech_daily_field_option (field_id, value, sort_order) VALUES (?, 'Existing option', 5)").run(optionField.id);
  const optionMaxBefore = db.prepare("SELECT MAX(sort_order) m FROM tech_daily_field_option WHERE field_id=?").get(optionField.id).m;
  const optionForm = new FormData();
  optionForm.set("csv_text", "New option 1\nNew option 2\nNew option 1\nExisting option");
  res = await worker.fetch(new Request(`https://x/daily-fields/${optionField.id}/options/import`, { method: "POST", headers: adminHeaders2, body: optionForm }), env, {});
  const importedOptions = db.prepare("SELECT value, sort_order, parent_option_id FROM tech_daily_field_option WHERE field_id=? AND value LIKE 'New option%' ORDER BY sort_order").all(optionField.id);
  check("option import adds only new values in order and reports added and skipped counts",
    res.status === 302 && res.headers.get("location") === `/daily-fields/${optionField.id}?imported=2&skipped=2`
      && importedOptions.map((o) => `${o.value}:${o.sort_order}:${o.parent_option_id}`).join("|")
        === `New option 1:${optionMaxBefore + 10}:null|New option 2:${optionMaxBefore + 20}:null`);
  db.exec("DELETE FROM tech_daily_field WHERE label IN ('CSV child','CSV parent','CSV loose','CSV grand','CSV repeated parent','CSV repeated child')");

  const combinedFieldId = Number(db.prepare(
    "INSERT INTO tech_daily_field (label,input_type,sort_order) VALUES ('양품/불량 수량','text',999)"
  ).run().lastInsertRowid);
  const legacyItemId = Number(db.prepare(
    "INSERT INTO tech_daily_item (part,category,title,owner) VALUES ('SSD','이슈대응','기존 통합수량 호환','테스터')"
  ).run().lastInsertRowid);
  const legacyUpdateId = Number(db.prepare(
    "INSERT INTO tech_daily_update (item_id,report_date) VALUES (?, '2026-09-02')"
  ).run(legacyItemId).lastInsertRowid);
  const remarkField = db.prepare("SELECT id FROM tech_daily_field WHERE label='비고'").get();
  db.prepare("INSERT INTO tech_daily_update_value (update_id,field_id,value,value_en,value_vi) VALUES (?,?,?,?,?)")
    .run(legacyUpdateId, combinedFieldId, "94/2", "94/2", "94/2");
  db.prepare("INSERT INTO tech_daily_update_value (update_id,field_id,value,value_en,value_vi) VALUES (?,?,?,?,?)")
    .run(legacyUpdateId, remarkField.id, "기존 이슈 조치내용", "Legacy issue action", "Nội dung xử lý sự cố cũ");
  res = await worker.fetch(new Request("https://x/daily-reports?date=2026-09-02", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("legacy combined good/defect quantity and issue remark remain compatible",
    res.status === 200
      && text.includes("기존 통합수량 호환")
      && text.includes('data-label="양품">94</td>')
      && text.includes('data-label="불량">2</td>')
      && text.includes("즉시 확인 필요 (1)"));

  res = await worker.fetch(new Request(`https://x/daily-items/${dailyItem.id}`, {
    headers: { cookie: `session=${adminCookie2}; lang=vi` },
  }), env, {});
  text = await res.text();
  check("Vietnamese input view shows localized standard fields and options",
    text.includes("Công đoạn đang thực hiện") && text.includes("Sự cố / Biện pháp") && text.includes("Đang tiến hành"));

  res = await worker.fetch(new Request(`https://x/daily-fields/${statusField.id}/delete`, {
    method: "POST",
    headers: adminHeaders2,
  }), env, {});
  const statusFieldAfterDelete = db.prepare("SELECT id FROM tech_daily_field WHERE id=?").get(statusField.id);
  const dailyValueAfterDelete = db.prepare("SELECT value FROM tech_daily_update_value WHERE update_id=? AND field_id=?").get(dailyUpdate.id, statusField.id);
  check("used daily field deletion is blocked and history is preserved",
    res.status === 302
      && res.headers.get("location").includes("deleteBlocked=1")
      && !!statusFieldAfterDelete
      && dailyValueAfterDelete?.value === "IN_PROGRESS");

  // 28) 허용 목록 밖의 업무 상태/우선순위와 잘못된 날짜는 기존 값을 훼손하지 않음
  const taskBeforeInvalidUpdate = db.prepare("SELECT status, priority, due_date FROM tech_task WHERE id=?").get(task.id);
  res = await worker.fetch(new Request(`https://x/tasks/${task.id}/update`, {
    method: "POST",
    body: new URLSearchParams({ status: "임의상태", priority: "긴급", owner: "이재현", due_date: "2026-02-30" }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  const taskAfterInvalidUpdate = db.prepare("SELECT status, priority, due_date FROM tech_task WHERE id=?").get(task.id);
  check("invalid task enums and date do not overwrite stored values",
    res.status === 302
      && taskAfterInvalidUpdate.status === taskBeforeInvalidUpdate.status
      && taskAfterInvalidUpdate.priority === taskBeforeInvalidUpdate.priority
      && taskAfterInvalidUpdate.due_date === taskBeforeInvalidUpdate.due_date);

  // 29) 제공한 데모 시드가 재실행 가능하고 임원 대시보드에서 바로 조회됨
  const demoSql = fs.readFileSync("./database/demo-seed.sql", "utf8");
  db.exec(demoSql);
  db.exec(demoSql);
  const demoDate = db.prepare("SELECT date('now', '-1 day') AS d").get().d;
  const demoItemCount = db.prepare(
    "SELECT COUNT(*) AS count FROM tech_daily_item WHERE title IN ('NVMe 512GB 신뢰성 평가','SATA SSD Read Fail 불량 분석','DDR5 16GB 고객 부팅 이슈 대응','Module ATE 정기점검')"
  ).get().count;
  check("demo seed is idempotent and creates four technical work items", demoItemCount === 4);

  res = await worker.fetch(new Request(`https://x/daily-reports?date=${demoDate}`, { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("demo dashboard includes all four technical categories and translated issue content",
    res.status === 200
      && text.includes("NVMe 512GB 신뢰성 평가")
      && text.includes("SATA SSD Read Fail 불량 분석")
      && text.includes("DDR5 16GB 고객 부팅 이슈 대응")
      && text.includes("Module ATE 정기점검")
      && text.includes("ECC 증가"));

  // 30) 일일업무 조회/입력은 컴팩트 밀도를 사용하고, 동적 사용자 입력은 UI 언어로 표시
  res = await worker.fetch(new Request("https://x/login"), env, {});
  text = await res.text();
  check("daily-work typography is compact and the access tools stay at the top right",
    text.includes("main.daily-work-page { padding:14px 14px 36px; font-size:14px; }")
      && text.includes(".daily-work-page h2 { font-size:20px")
      && text.includes(".daily-work-page button { padding:6px 11px; font-size:13px; }")
      && text.includes("font-size:clamp(10px, calc(.64vw + 2px), 12px)")
      && text.includes(".page-tools { position:fixed; top:14px; right:20px;")
      && text.includes("white-space:nowrap; font-size:14px;")
      && text.includes(".page-tools .logout-button")
      && text.includes('<div class="page-tools no-print"><span class="lang-switcher"'));

  const aiCalls = [];
  const fakeTranslations = {
    "Fixture inspection|ko": "치공구 검사",
    "Fixture inspection|vi": "Kiểm tra đồ gá",
    "Inspect fixture alignment|ko": "치공구 정렬 검사",
    "Inspect fixture alignment|vi": "Kiểm tra căn chỉnh đồ gá",
    "Inspection completed|ko": "검사 완료",
    "Inspection completed|vi": "Đã hoàn tất kiểm tra",
    "Uu tien cong viec|ko": "업무 우선순위",
    "Uu tien cong viec|en": "Work priority",
    "Can kiem tra|ko": "확인 필요",
    "Can kiem tra|en": "Needs inspection",
    "Archive inspection|ko": "과거 검사",
    "Archive inspection|vi": "Kiểm tra lưu trữ",
    "Machine inspection completed|ko": "설비 검사 완료",
    "Machine inspection completed|vi": "Đã hoàn tất kiểm tra thiết bị",
  };
  const envWithAI = {
    ...env,
    AI: {
      async run(model, input) {
        aiCalls.push({ model, ...input });
        return { translated_text: fakeTranslations[`${input.text}|${input.target_lang}`] || `${input.target_lang}:${input.text}` };
      },
    },
  };

  res = await worker.fetch(new Request("https://x/tasks/new", {
    method: "POST",
    body: new URLSearchParams({
      title: "Fixture inspection",
      description: "Inspect fixture alignment",
      priority: "중",
      owner: "Tester",
      due_date: "2026-09-10",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: `session=${adminCookie2}; lang=en` },
  }), envWithAI, {});
  const translatedTask = db.prepare("SELECT id FROM tech_task WHERE title='Fixture inspection'").get();
  res = await worker.fetch(new Request("https://x/tasks/legacy", {
    headers: { cookie: `session=${adminCookie2}; lang=ko` },
  }), envWithAI, {});
  text = await res.text();
  check("task titles entered in English are displayed in the selected Korean UI language",
    res.status === 200 && !!translatedTask && text.includes("치공구 검사") && !text.includes(">Fixture inspection<"));

  res = await worker.fetch(new Request(`https://x/tasks/${translatedTask.id}/updates`, {
    method: "POST",
    body: new URLSearchParams({ content: "Inspection completed" }),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: `session=${adminCookie2}; lang=en` },
  }), envWithAI, {});
  res = await worker.fetch(new Request(`https://x/tasks/${translatedTask.id}`, {
    headers: { cookie: `session=${adminCookie2}; lang=vi` },
  }), envWithAI, {});
  text = await res.text();
  check("task descriptions and progress entries follow the selected Vietnamese UI language",
    text.includes("Kiểm tra căn chỉnh đồ gá") && text.includes("Đã hoàn tất kiểm tra"));

  res = await worker.fetch(new Request("https://x/daily-items/new", {
    method: "POST",
    body: new URLSearchParams({ part: "SSD", category: "평가", title: "Uu tien cong viec", owner: "Tester" }),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: `session=${adminCookie2}; lang=vi` },
  }), envWithAI, {});
  const translatedDailyItem = db.prepare("SELECT id FROM tech_daily_item WHERE title='Uu tien cong viec'").get();
  check("Vietnamese without diacritics is detected as Vietnamese instead of English",
    !!translatedDailyItem && aiCalls.some((call) => call.text === "Uu tien cong viec" && call.source_lang === "vi"));

  res = await worker.fetch(new Request(`https://x/daily-fields/${productField.id}/options/new`, {
    method: "POST",
    body: new URLSearchParams({ value: "Can kiem tra" }),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: `session=${adminCookie2}; lang=vi` },
  }), envWithAI, {});
  res = await worker.fetch(new Request(`https://x/daily-items/${translatedDailyItem.id}/updates`, {
    method: "POST",
    body: new URLSearchParams({
      report_date: "2026-09-03",
      [`field_${productField.id}`]: "Can kiem tra",
      [`field_${statusField.id}`]: "IN_PROGRESS",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: `session=${adminCookie2}; lang=vi` },
  }), envWithAI, {});
  res = await worker.fetch(new Request(`https://x/daily-items/${translatedDailyItem.id}`, {
    headers: { cookie: `session=${adminCookie2}; lang=en` },
  }), envWithAI, {});
  text = await res.text();
  check("custom dropdown options and daily-item titles use cached UI-language translations",
    text.includes("Work priority") && text.includes("Needs inspection"));

  db.prepare(
    `INSERT INTO tech_daily_report (report_date,part,category,title,content,status)
     VALUES ('2026-09-03','Module','Inspection','Archive inspection','Machine inspection completed','Done')`
  ).run();
  res = await worker.fetch(new Request("https://x/daily-reports?date=2026-09-03", {
    headers: { cookie: `session=${adminCookie2}; lang=vi` },
  }), envWithAI, {});
  text = await res.text();
  check("legacy archive text is translated on display and cached for the selected UI language",
    text.includes("Kiểm tra lưu trữ") && text.includes("Đã hoàn tất kiểm tra thiết bị"));

  res = await worker.fetch(new Request(`https://x/daily-items/${translatedDailyItem.id}/updates`, {
    method: "POST",
    body: new URLSearchParams({ report_date: "2026-02-30", [`field_${statusField.id}`]: "IN_PROGRESS" }),
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: `session=${adminCookie2}; lang=vi` },
  }), envWithAI, {});
  text = await res.text();
  check("plain-text validation errors also follow the selected UI language",
    res.status === 400 && text.includes("ngày báo cáo hợp lệ"));

  // Administrator-only deletion: exercise real routes and FK cascades.
  db.prepare("UPDATE techops_users SET email_verified_at=datetime('now') WHERE id=?").run(memberApprovalRow.id);
  res = await worker.fetch(new Request("https://x/login", {
    method: "POST", headers: allowedOfficeIpHeaders,
    body: new URLSearchParams({ username: "member2@hanyangdgtvina.com", password: temporaryPassword }),
  }), env, {});
  const deleteMemberHeaders = { cookie: `session=${extractCookie(res)}` };
  for (const endpoint of ["import", "export"]) {
    res = await worker.fetch(new Request(`https://x/daily-fields/${endpoint}`, { headers: deleteMemberHeaders }), env, {});
    check(`member cannot access settings CSV ${endpoint}`, res.status === 403);
  }
  res = await fieldUpload(newSettings, true, deleteMemberHeaders);
  check("member cannot submit settings CSV", res.status === 403 && !db.prepare("SELECT id FROM tech_daily_field WHERE label='CSV parent'").get());
  const makeDeleteItem = () => Number(db.prepare("INSERT INTO tech_daily_item(part,title) VALUES ('SSD','Delete test')").run().lastInsertRowid);
  const makeDeleteUpdate = (itemId) => {
    const updateId = Number(db.prepare("INSERT INTO tech_daily_update(item_id,report_date) VALUES (?, '2026-09-05')").run(itemId).lastInsertRowid);
    db.prepare("INSERT INTO tech_daily_update_value(update_id,field_id,value) VALUES (?,?,'IN_PROGRESS')").run(updateId, statusField.id);
    return updateId;
  };
  const deleteItemId = makeDeleteItem(), otherItemId = makeDeleteItem();
  const deleteUpdateId = makeDeleteUpdate(deleteItemId), keptUpdateId = makeDeleteUpdate(deleteItemId);
  const otherUpdateId = makeDeleteUpdate(otherItemId);
  const itemDeleteUrl = `https://x/daily-items/${deleteItemId}/delete`;
  const updateDeleteUrl = `https://x/daily-items/${deleteItemId}/updates/${deleteUpdateId}/delete`;
  const exists = (table, id) => !!db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id);
  for (const [headers, visible] of [[adminHeaders2, true], [deleteMemberHeaders, false]]) {
    res = await worker.fetch(new Request(`https://x/daily-items/${deleteItemId}`, { headers }), env, {});
    text = await res.text();
    check(`daily deletion controls visible only to admin (${visible})`, res.status === 200 && text.includes(`/daily-items/${deleteItemId}/delete`) === visible && text.includes(`/updates/${deleteUpdateId}/delete`) === visible);
  }
  for (const url of [itemDeleteUrl, updateDeleteUrl]) {
    res = await worker.fetch(new Request(url, { method: "POST", headers: deleteMemberHeaders }), env, {});
    check("member direct deletion is forbidden without changing data", res.status === 403 && exists("tech_daily_item", deleteItemId) && exists("tech_daily_update", deleteUpdateId));
    res = await worker.fetch(new Request(url, { method: "POST" }), env, {});
    check("anonymous deletion requires login", res.status === 302 && res.headers.get("location") === "/login");
    res = await worker.fetch(new Request(url, { headers: adminHeaders2 }), env, {});
    check("GET cannot delete daily data", exists("tech_daily_item", deleteItemId) && exists("tech_daily_update", deleteUpdateId));
    res = await worker.fetch(new Request(url, { method: "POST", headers: { ...adminHeaders2, origin: "https://evil.example" } }), env, {});
    check("cross-origin daily deletion is rejected", res.status === 403 && exists("tech_daily_update", deleteUpdateId));
  }
  res = await worker.fetch(new Request(`https://x/daily-items/${deleteItemId}/updates/${otherUpdateId}/delete`, { method: "POST", headers: adminHeaders2 }), env, {});
  check("update deletion is scoped to its parent item", exists("tech_daily_update", otherUpdateId));
  res = await worker.fetch(new Request(updateDeleteUrl, { method: "POST", headers: adminHeaders2 }), env, {});
  check("admin deletes only selected update and its values", res.status === 302 && !exists("tech_daily_update", deleteUpdateId) && !db.prepare("SELECT id FROM tech_daily_update_value WHERE update_id=?").get(deleteUpdateId) && exists("tech_daily_update", keptUpdateId) && exists("tech_daily_item", deleteItemId));
  res = await worker.fetch(new Request(itemDeleteUrl, { method: "POST", headers: adminHeaders2 }), env, {});
  check("admin deletes item and all dependent history without touching other items", res.status === 302 && res.headers.get("location") === "/daily-items" && !exists("tech_daily_item", deleteItemId) && !exists("tech_daily_update", keptUpdateId) && !db.prepare("SELECT id FROM tech_daily_update_value WHERE update_id=?").get(keptUpdateId) && exists("tech_daily_update", otherUpdateId));
  res = await worker.fetch(new Request(itemDeleteUrl, { method: "POST", headers: adminHeaders2 }), env, {});
  check("repeated deletion is harmless", res.status === 302 && exists("tech_daily_item", otherItemId));

  // 32) 엑셀 기준 일일보고 설정 — 분류 흐름, 상태, 기존 이력 초기화
  const historyBeforeStandard = db.prepare("SELECT COUNT(*) count FROM tech_daily_update").get().count;
  res = await worker.fetch(new Request("https://x/daily-fields/apply-standard", {
    method: "POST", headers: adminHeaders2,
  }), env, {});
  const standardFields = db.prepare("SELECT label,input_type,sort_order FROM tech_daily_field ORDER BY sort_order").all();
  const standardStatusCount = db.prepare(
    "SELECT COUNT(*) count FROM tech_daily_field_option o JOIN tech_daily_field f ON f.id=o.field_id WHERE f.label='상태'"
  ).get().count;
  check("admin applies the workbook-based daily report settings and clears old report history",
    historyBeforeStandard > 0 && res.status === 302
      && db.prepare("SELECT COUNT(*) count FROM tech_daily_update").get().count === 0
      && standardFields.slice(0, 5).map((field) => field.label).join(",") === "소속부서,업무구분,업무유형,중분류,소분류"
      && standardFields.find((field) => field.label === "파트넘버")?.input_type === "textarea"
      && standardStatusCount === 0 && standardFields.some(field => field.label === "LOTID"));

  res = await worker.fetch(new Request("https://x/daily-fields", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("settings page shows the standard daily report flow",
    res.status === 200 && text.includes("일일보고 분류 기준") && text.includes("Product Info.") && text.includes("표준 설정 적용"));

  res = await worker.fetch(new Request(`https://x/daily-items/${otherItemId}`, { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("issue classification keeps its category label instead of using the issue status label",
    /<option value="이슈"[^>]*>이슈<\/option>/.test(text) && !/<option value="ISSUE"/.test(text));

  const standardFieldIds = Object.fromEntries(db.prepare("SELECT id,label FROM tech_daily_field").all().map((field) => [field.label, field.id]));
  res = await worker.fetch(new Request(`https://x/daily-items/${otherItemId}/updates`, {
    method: "POST",
    body: new URLSearchParams({
      report_date: "2026-09-14",
      [`field_${standardFieldIds["소속부서"]}`]: "SSD",
      [`field_${standardFieldIds["업무구분"]}`]: "평가",
      [`field_${standardFieldIds["업무유형"]}`]: "자재 평가",
      [`field_${standardFieldIds["중분류"]}`]: "DOE",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  check("server rejects a classification combination that is absent from the workbook", res.status === 400);

  res = await worker.fetch(new Request(`https://x/daily-items/${otherItemId}/updates`, {
    method: "POST",
    body: new URLSearchParams({
      report_date: "2026-09-14",
      [`field_${standardFieldIds["소속부서"]}`]: "Module",
      [`field_${standardFieldIds["업무구분"]}`]: "평가",
      [`field_${standardFieldIds["업무유형"]}`]: "자재 평가",
      [`field_${standardFieldIds["중분류"]}`]: "DOE",
      [`field_${standardFieldIds["LOTID"]}`]: "LOT-001",
      [`field_${standardFieldIds["파트넘버"]}`]: "P/N-001\nP/N-002",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  check("valid classification, LOTID and multiple part numbers are stored",
    res.status === 302 && db.prepare("SELECT COUNT(*) count FROM tech_daily_update_value WHERE value='LOT-001' OR value LIKE 'P/N-001%'").get().count === 2);

  // 32b) /daily-items 첫 등록 화면 — 표준 설정 적용 후에는 분류·보고 입력을 항목 등록과 함께 받는다
  res = await worker.fetch(new Request("https://x/daily-items", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("new-item form switches to the combined classification+report flow once the standard settings are applied",
    res.status === 200
      && text.includes('name="report_date"')
      && text.includes('data-classification-level="0"')
      && !text.includes('name="title"')
      && !text.includes('name="part" required')
      && !text.includes('name="category"'));

  const idFromLocation = (response) => {
    const location = response.headers.get("location");
    return location ? Number(location.split("/").pop()) : null;
  };

  const itemCountBeforeCombined = db.prepare("SELECT COUNT(*) count FROM tech_daily_item").get().count;
  res = await worker.fetch(new Request("https://x/daily-items/new", {
    method: "POST",
    body: new URLSearchParams({
      owner: "테스터",
      report_date: "2026-09-15",
      [`field_${standardFieldIds["소속부서"]}`]: "SSD",
      [`field_${standardFieldIds["업무구분"]}`]: "평가",
      [`field_${standardFieldIds["업무유형"]}`]: "자재 평가",
      [`field_${standardFieldIds["중분류"]}`]: "DOE",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  check("combined registration rejects a classification combination absent from the workbook",
    res.status === 400 && db.prepare("SELECT COUNT(*) count FROM tech_daily_item").get().count === itemCountBeforeCombined);

  res = await worker.fetch(new Request("https://x/daily-items/new", {
    method: "POST",
    body: new URLSearchParams({
      owner: "테스터",
      report_date: "2026-09-15",
      [`field_${standardFieldIds["소속부서"]}`]: "SSD",
      [`field_${standardFieldIds["업무구분"]}`]: "평가",
      [`field_${standardFieldIds["업무유형"]}`]: "PGM 평가",
      [`field_${standardFieldIds["중분류"]}`]: "PGM/EVAL",
      [`field_${standardFieldIds["LOTID"]}`]: "LOT-002",
      [`field_${standardFieldIds["추가입력"]}`]: "PCT-85",
      [`field_${standardFieldIds["파트넘버"]}`]: "P/N-100",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  const combinedItem = db.prepare("SELECT * FROM tech_daily_item WHERE id=?").get(idFromLocation(res));
  const combinedUpdate = combinedItem ? db.prepare("SELECT id FROM tech_daily_update WHERE item_id=?").get(combinedItem.id) : null;
  const combinedStatusValue = combinedUpdate
    ? db.prepare("SELECT value FROM tech_daily_update_value WHERE update_id=? AND field_id=?").get(combinedUpdate.id, standardFieldIds["LOTID"])
    : null;
  check("registering a new item with the standard flow creates the item and its first report together",
    res.status === 302 && res.headers.get("location") === `/daily-items/${combinedItem?.id}`
      && combinedItem?.part === "SSD" && combinedItem?.category === "평가"
      && combinedItem?.owner === "관리자"
      && !!combinedUpdate && combinedStatusValue?.value === "LOT-002");
  check("new item title is generated from classification + additional input + part number instead of free text",
    combinedItem?.title === "[SSD] [PGM/EVAL 평가] [PCT-85] [P/N-100]");

  const combinedForm = (reportDate = "2026-09-15") => new URLSearchParams({
    owner: "테스터", report_date: reportDate,
    [`field_${standardFieldIds["소속부서"]}`]: "Module",
    [`field_${standardFieldIds["업무구분"]}`]: "평가",
    [`field_${standardFieldIds["업무유형"]}`]: "PGM 평가",
    [`field_${standardFieldIds["중분류"]}`]: "PGM/EVAL",
    [`field_${standardFieldIds["LOTID"]}`]: "LOT-002",
  });
  const combinedPost = (body, path = "/daily-items/new") => worker.fetch(new Request(`https://x${path}`, {
    method: "POST", body,
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  const dailyCounts = () => ["tech_daily_item", "tech_daily_update", "tech_daily_update_value"]
    .map((table) => db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count).join(",");
  const countsBeforeFailure = dailyCounts();
  res = await combinedPost(combinedForm("2026-02-30"));
  check("combined registration rejects invalid dates without creating rows", res.status === 400 && dailyCounts() === countsBeforeFailure);

  // Fail after earlier values were inserted to exercise a real transaction rollback.
  db.exec(`CREATE TRIGGER fail_daily_value BEFORE INSERT ON tech_daily_update_value
    WHEN NEW.field_id=${standardFieldIds["LOTID"]}
    BEGIN SELECT RAISE(ABORT, 'test report write failure'); END;`);
  res = await combinedPost(combinedForm());
  check("failed first-report value rolls back the item, header and all earlier values",
    res.status === 500 && dailyCounts() === countsBeforeFailure);
  res = await combinedPost(combinedForm(), `/daily-items/${combinedItem.id}/updates`);
  check("failed existing-item report leaves no empty header or partial values",
    res.status === 500 && dailyCounts() === countsBeforeFailure);
  db.exec("DROP TRIGGER fail_daily_value");

  res = await combinedPost(combinedForm());
  const moduleCombined = db.prepare("SELECT * FROM tech_daily_item WHERE id=?").get(idFromLocation(res));
  check("Module registration links all first-report values to its own item",
    res.status === 302 && moduleCombined?.part === "Module"
      && db.prepare(`SELECT COUNT(*) count FROM tech_daily_update_value v JOIN tech_daily_update u ON u.id=v.update_id
        WHERE u.item_id=?`).get(moduleCombined.id).count === 5
      && db.prepare("SELECT COUNT(*) count FROM tech_daily_update WHERE item_id=?").get(combinedItem.id).count === 1);

  db.exec("SAVEPOINT empty_input_test; DELETE FROM tech_daily_item;");
  res = await worker.fetch(new Request("https://x/daily-items", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("empty input list opens the combined form with all five classification levels",
    res.status === 200 && /<details[^>]*\bopen>/.test(text)
      && [0, 1, 2, 3, 4].every((level) => text.includes(`data-classification-level="${level}"`))
      && text.includes("data-product-info") && text.includes('name="report_date"'));
  db.exec("ROLLBACK TO empty_input_test; RELEASE empty_input_test;");

  db.exec("SAVEPOINT duplicate_classification_test;");
  db.prepare(`INSERT INTO tech_daily_field_option (field_id,value,sort_order)
    VALUES (?, '평가', 999)`).run(standardFieldIds["업무구분"]);
  res = await worker.fetch(new Request("https://x/daily-items", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  const classificationSelect = text.match(new RegExp(`<select name="field_${standardFieldIds["업무구분"]}"[^>]*>([\\s\\S]*?)</select>`));
  check("repeated classification values from CSV appear once in the input dropdown",
    res.status === 200 && (classificationSelect?.[1].match(/value="평가"/g) || []).length === 1);
  db.exec("ROLLBACK TO duplicate_classification_test; RELEASE duplicate_classification_test;");

  for (const [index, row] of DAILY_CLASSIFICATION_ROWS.entries()) {
    const body = combinedForm();
    row.forEach((value, level) => body.set(`field_${standardFieldIds[DAILY_CLASSIFICATION_FIELDS[level]]}`, value || ""));
    res = await combinedPost(body);
    const savedItemId = idFromLocation(res);
    const savedItem = savedItemId ? db.prepare("SELECT * FROM tech_daily_item WHERE id=?").get(savedItemId) : null;
    const savedValues = savedItem ? db.prepare(`SELECT f.label, v.value FROM tech_daily_update_value v
      JOIN tech_daily_update u ON u.id=v.update_id JOIN tech_daily_field f ON f.id=v.field_id
      WHERE u.item_id=?`).all(savedItem.id) : [];
    check(`workbook combination ${index + 1} preserves its part, category and complete classification`,
      res.status === 302 && savedItem?.part === row[0] && savedItem?.category === row[1]
        && row.every((value, level) => !value || savedValues.some((saved) => saved.label === DAILY_CLASSIFICATION_FIELDS[level] && saved.value === value)));
  }

  // 33) 기준정보(Master Data) — 조회 전용 화면 + 안전장치
  const ssdSet = db.prepare("SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'").get();
  check("master data sets are seeded from schema.sql", !!ssdSet);

  res = await worker.fetch(new Request("https://x/master/SSD_PRODUCT"), env, {});
  check("anonymous cannot view master data list", res.status === 302 && res.headers.get("location") === "/login");

  res = await worker.fetch(new Request("https://x/master/setup", { headers: adminHeaders2 }), env, {});
  check("admin can view master setup", res.status === 200 && (await res.text()).includes("SSD_PRODUCT"));

  db.prepare(
    "INSERT INTO techops_users (username, password_hash, password_salt, display_name, role, email_verified_at) VALUES ('masterviewer@hanyangdgtvina.com','x','x','뷰어','member', datetime('now'))"
  ).run();
  const viewerId = db.prepare("SELECT id FROM techops_users WHERE username='masterviewer@hanyangdgtvina.com'").get().id;
  db.prepare("INSERT INTO techops_sessions (id, user_id, expires_at) VALUES ('master-viewer-session', ?, datetime('now','+1 day'))").run(viewerId);
  const viewerHeaders = { cookie: "session=master-viewer-session" };

  res = await worker.fetch(new Request("https://x/master/setup", { headers: viewerHeaders }), env, {});
  check("non-admin cannot access master setup", res.status === 403);

  // 엑셀 업로드 마법사는 2단계 범위라, 조회 화면을 확인하기 위한 테스트 데이터는 여기서 직접 적재한다.
  db.prepare("INSERT INTO tech_master_row (set_id, row_key, data_json, verify_status) VALUES (?, 'TPROD0001', ?, 'OK')")
    .run(ssdSet.id, JSON.stringify({ PROD_ID: "TPROD0001", SALES: "DC", MODEL_NAME: "Alpha 512G" }));
  db.prepare("INSERT INTO tech_master_row (set_id, row_key, data_json, verify_status) VALUES (?, 'TPROD0002', ?, 'ERROR')")
    .run(ssdSet.id, JSON.stringify({ PROD_ID: "TPROD0002", SALES: "EP", MODEL_NAME: "Beta 1TB" }));
  db.prepare("INSERT INTO tech_master_row (set_id, row_key, data_json, verify_status) VALUES (?, 'MZTEST001', ?, 'OK')")
    .run(ssdSet.id, JSON.stringify({ PROD_ID: "MZTEST001", SSD_PN: "MZ-TEST-001", MODEL_NAME: "Gamma SSD", DENSITY: "1TB" }));

  res = await worker.fetch(new Request("https://x/api/product-match?q=MZ-TEST-001", { headers: viewerHeaders }), env, {});
  const productMatch = await res.json();
  check("part numbers beginning with MZ use the SSD product master and return match text",
    res.status === 200 && productMatch.source === "SSD_PRODUCT" && productMatch.matches[0]?.display.includes("Gamma SSD"));

  const moduleSet = db.prepare("SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'").get();
  db.prepare("INSERT INTO tech_master_row (set_id,row_key,data_json,verify_status) VALUES (?, 'MOD-TEST-001', ?, 'OK')")
    .run(moduleSet.id, JSON.stringify({ BASE_PN: "MOD-TEST-001", MDL_INFO: "D5 RDIMM", GEN: "D1a", IC_VER: "VB", SPEED: "5600", DENSITY: "16GB" }));
  res = await worker.fetch(new Request("https://x/api/product-match?q=MOD-TEST-001", { headers: viewerHeaders }), env, {});
  const moduleProductMatch = await res.json();
  check("other part numbers use the Module product master and return a compact Gen/IC/Density/Speed/form-factor summary",
    res.status === 200 && moduleProductMatch.source === "DM_PRODUCT" && moduleProductMatch.matches[0]?.display === "D1a VB 16GB 5600 RDIMM");

  // D1bp/D1c 세대는 파트넘버 체계 변경으로 기준 P/N이 16자리가 아니라 12자리다(2026-09-16
  // 사용자 제보 — 운영 마스터 데이터로 확인). 실제 입력되는 25자리 파트넘버는 16자리로는
  // 매칭되지 않고 앞 12자리로만 매칭돼야 한다.
  db.prepare("INSERT INTO tech_master_row (set_id,row_key,data_json,verify_status) VALUES (?, 'MDRR548QDBC2', ?, 'OK')")
    .run(moduleSet.id, JSON.stringify({
      BASE_PN: "MDRR548QDBC2", MDL_INFO: "D5 RDIMM", GEN: "D1bp", IC_VER: "VC",
      SPEED: "6400", PRDT_DVN: "VC 6400", PRDT_DVN_FULL: "D5 RDIMM D1bp VC 6400", DENSITY: "32GB",
    }));
  res = await worker.fetch(new Request("https://x/api/product-match?q=MDRR548QDBC2-3L000-HA0BP2", { headers: viewerHeaders }), env, {});
  const shortGenMatch = await res.json();
  check("D1bp/D1c generation part numbers fall back to their 12-character base P/N when the 16-character prefix has no match",
    res.status === 200 && shortGenMatch.source === "DM_PRODUCT" && shortGenMatch.matches[0]?.display === "D1bp VC 32GB 6400 RDIMM");

  res = await combinedPost(new URLSearchParams({
    owner: "테스터", report_date: "2026-09-15",
    [`field_${standardFieldIds["소속부서"]}`]: "Module",
    [`field_${standardFieldIds["업무구분"]}`]: "평가",
    [`field_${standardFieldIds["업무유형"]}`]: "설비 평가",
    [`field_${standardFieldIds["중분류"]}`]: "시양산",
    [`field_${standardFieldIds["소분류"]}`]: "신규 설비",
    [`field_${standardFieldIds["추가입력"]}`]: "PCT3-85",
    [`field_${standardFieldIds["파트넘버"]}`]: "MDRR548QDBC2-3L000-HA0BP2\nMDRR548QDBC2-3L000-HA0BKG\nMDRR548QDBC2-3G000-HA0BP2",
  }));
  const realExampleItem = db.prepare("SELECT * FROM tech_daily_item WHERE id=?").get(idFromLocation(res));
  check("auto-generated title combines department, classification, additional input and the deduped part-number match",
    res.status === 302 && realExampleItem?.title === "[MDL] [신규 설비 시양산 평가] [PCT3-85] [D1bp VC 32GB 6400 RDIMM]");

  res = await worker.fetch(new Request("https://x/master/SSD_PRODUCT", { headers: viewerHeaders }), env, {});
  text = await res.text();
  check("logged-in member can view the master data list with both seeded rows",
    res.status === 200 && text.includes("TPROD0001") && text.includes("TPROD0002") && text.includes("Alpha 512G"));

  res = await worker.fetch(new Request("https://x/master/SSD_PRODUCT?q=Alpha", { headers: viewerHeaders }), env, {});
  text = await res.text();
  check("search narrows the master data list to matching rows only",
    res.status === 200 && text.includes("TPROD0001") && !text.includes("TPROD0002"));

  res = await worker.fetch(new Request("https://x/master", { headers: viewerHeaders }), env, {});
  text = await res.text();
  const masterSetCounts = db.prepare("SELECT s.code, (SELECT COUNT(*) FROM tech_master_row r WHERE r.set_id = s.id) AS n FROM tech_master_set s WHERE s.active = 1").all();
  check("master index shows every active set with its row count",
    res.status === 200 && masterSetCounts.some(({ n }) => n > 0) && masterSetCounts.every(({ code, n }) =>
      text.slice(text.indexOf(`href="/master/${code}"`)).match(/>(\d+)<span/)?.[1] === String(n)));

  res = await worker.fetch(new Request("https://x/master/SSD_PRODUCT", { headers: viewerHeaders }), env, {});
  text = await res.text();
  const ssdFilterFields = db.prepare("SELECT code FROM tech_master_field WHERE set_id=? AND active=1 AND show_in_list=1 AND data_type='SELECT'").all(ssdSet.id);
  check("master list filter dropdowns list each select field's distinct values in order",
    res.status === 200 && ssdFilterFields.length > 0 && ssdFilterFields.every(({ code }) => {
      const expected = db.prepare(`SELECT DISTINCT json_extract(data_json, '$.${code}') AS v FROM tech_master_row
        WHERE set_id = ? AND active = 1 AND json_extract(data_json, '$.${code}') IS NOT NULL AND json_extract(data_json, '$.${code}') != '' ORDER BY v`).all(ssdSet.id).map((r) => String(r.v));
      const select = text.slice(text.indexOf(`name="f_${code}"`), text.indexOf("</select>", text.indexOf(`name="f_${code}"`)));
      return [...select.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]).join("|") === expected.join("|");
    })
    && text.includes('<option value="DC"'));
  check("master list shares the daily pages' compact layout, toolbar and count badge",
    text.includes('<main class="daily-work-page master-page">')
      && text.includes('<form method="get" action="/master/SSD_PRODUCT" class="daily-filter">')
      && /<h2>SSD 제품 마스터 <span class="daily-count">\d+<\/span><\/h2>/.test(text));
  res = await worker.fetch(new Request("https://x/master/setup/SSD_PRODUCT", { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check("master field form keeps checkboxes inline with their labels",
    res.status === 200 && text.includes('<div class="row master-checks">') && text.includes('name="show_in_list" value="1" checked'));

  let duplicateRejected = false;
  try {
    db.prepare("INSERT INTO tech_master_row (set_id, row_key, data_json) VALUES (?, 'TPROD0001', '{}')").run(ssdSet.id);
  } catch (e) {
    duplicateRejected = true;
  }
  check("duplicate (set_id, row_key) insert is rejected by the schema's UNIQUE constraint", duplicateRejected);

  const prodIdField = db.prepare("SELECT id, code, is_key FROM tech_master_field WHERE set_id=? AND code='PROD_ID'").get(ssdSet.id);
  res = await worker.fetch(new Request(`https://x/master/setup/SSD_PRODUCT/fields/${prodIdField.id}`, {
    method: "POST",
    body: new URLSearchParams({ code: "PROD_ID_RENAMED", label_ko: "제품ID", label_en: "Product ID", label_vi: "Ma san pham", data_type: "TEXT" }),
    headers: { "content-type": "application/x-www-form-urlencoded", ...adminHeaders2 },
  }), env, {});
  const prodIdFieldAfter = db.prepare("SELECT code, is_key FROM tech_master_field WHERE id=?").get(prodIdField.id);
  check("is_key/code changes are rejected once the set already has data",
    res.status === 302 && prodIdFieldAfter.code === "PROD_ID" && prodIdFieldAfter.is_key === 1);

  // The standalone LOT INFO screen is removed while its internal lookup remains available.
  res = await worker.fetch(new Request('https://x/lot-info', { headers: viewerHeaders }), env, {});
  check('standalone LOT INFO screen is removed', res.status === 404);
  res = await worker.fetch(new Request('https://x/lot-info/template', { headers: viewerHeaders }), env, {});
  check('LOT INFO Excel template endpoint is removed', res.status === 404);
  res = await worker.fetch(new Request('https://x/daily-items', { headers: viewerHeaders }), env, {});
  text = await res.text();
  check('daily work navigation no longer shows LOT INFO', res.status === 200 && !text.includes('href="/lot-info"'));
  db.prepare("INSERT INTO tech_lot_info(lot_id,data_json,source_filename,imported_by) VALUES('0000123',?,'internal',?),('LOT-B',?,'internal',?)")
    .run(JSON.stringify({ LOTID: '0000123', NEW_COLUMN: 'preserved' }), viewerId, JSON.stringify({ LOTID: 'LOT-B', PROCESS: 'saved' }), viewerId);
  res = await worker.fetch(new Request('https://x/api/lot-info?ids=0000123'), env, {});
  check('LOT API requires authentication', res.status === 401);
  res = await worker.fetch(new Request('https://x/api/lot-info?ids=0000123%0ALOT-B%0AMISSING', { headers: viewerHeaders }), env, {});
  const lookupLots = await res.json();
  check('internal LOT lookup remains available after screen removal', res.status === 200 && lookupLots.tracker === 'pending' && lookupLots.records[0].info.NEW_COLUMN === 'preserved' && lookupLots.records[2].info === null);
  res = await worker.fetch(new Request('https://x/api/lot-info?ids=' + encodeURIComponent(Array.from({ length: 51 }, (_, i) => 'L' + i).join('\n')), { headers: viewerHeaders }), env, {});
  check('LOT lookup limits IDs before database queries', res.status === 400);

  // LOT Tracker parses raw See LOT exports and can save results to the internal LOT store.
  const seeLotHeader = ['EVENT_NAME', 'DATE/TIME', 'QTY', 'STEP', 'EQP', 'LINE', 'OPERID', 'CHG_ITEM', 'CHG_VALS', 'QTY', 'COMMENT'];
  const makeSeeLotBook = rows => {
    const book = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(book, xlsxUtils.aoa_to_sheet([seeLotHeader, ...rows]), 'Sheet1');
    return new Uint8Array(writeXlsx(book, { type: 'array', bookType: 'biff8' }));
  };
  const trackerBytes = makeSeeLotBook([
    ['Hold', '9/16/26 9:00', 299, 'M165', '-', 'VMDL', 'tester', 'MULTIHOLDCODE', 'EV:', 0, 'evaluation hold'],
    ['TrackOut', '9/15/26 12:00', 299, 'M164', 'FVI-01', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/15/26 11:00', 299, 'M164', 'FVI-01', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackOut', '9/15/26 10:00', 299, 'M160', 'AVI-07', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/15/26 9:00', 299, 'M160', 'AVI-07', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackOut', '9/15/26 8:00', 299, 'M130', 'AI-H910', 'VMDL', 'tester', '', '', 0, ''],
    ['Scrap', '9/15/26 8:00', 299, 'M130', 'AI-H910', 'VMDL', 'tester', '', '', 1, '4583/ETC;SUPER CAP CHARGING FAIL'],
    ['TrackIn', '9/15/26 7:00', 300, 'M130', 'AI-H910', 'VMDL', 'tester', '', '', 0, ''],
    ['대외비', '', '', '', '', '', '', '', '', '', ''],
  ]);
  const trackerSummary = summarizeSeeLotWorkbook(trackerBytes, 'TRACKER-A.xls', 'MZWL61T9HFLT-00AW7-6Q8');
  check('See LOT parser calculates interface failures and yield', trackerSummary.initialQty === '300' && trackerSummary.interface.out === '299' && trackerSummary.interface.failCodes === '4583*1' && trackerSummary.interface.failQty === '1' && trackerSummary.interface.yld === '99.7%');
  check('See LOT parser calculates later processes and current status', trackerSummary.m160.eqp === 'AVI-07' && trackerSummary.m164.out === '299' && trackerSummary.status === 'Hold M165' && trackerSummary.asOf === '9/16/26 9:00');

  const csvText = seeLotHeader.join(',') + '\r\n' +
    'TrackOut,2026-09-20 10:00,249,M130,EQP-01,VMDL,00001,,,0,\r\n' +
    'Scrap,2026-09-20 09:30,249,M130,EQP-01,VMDL,00001,,,1,"4583/한글, quoted ""text""\r\nsecond line"\r\n' +
    'TrackIn,2026-09-20 09:00,250,M130,EQP-01,VMDL,00001,,,0,\r\n';
  const csvBytes = new TextEncoder().encode('\uFEFF' + csvText);
  const csvSummary = summarizeSeeLotWorkbook(csvBytes, '0000123.CSV');
  check('See LOT UTF-8 CSV preserves LOTID and handles BOM, quoted commas, quotes and multiline text', csvSummary.lotId === '0000123' && csvSummary.interface.in === '250' && csvSummary.interface.out === '249' && csvSummary.interface.failCodes === '4583*1' && csvSummary.interface.yld === '99.6%');
  const legacyCsv = new Uint8Array([...new TextEncoder().encode(csvText.replace('한글', 'text')), 0xb4, 0xeb, 0xbf, 0xdc, 0xba, 0xf1, ...new TextEncoder().encode(',,,,,,,,,,\r\n')]);
  check('See LOT accepts Korean Windows CSV with a confidentiality footer', summarizeSeeLotWorkbook(legacyCsv, 'LEGACY.csv').interface.out === '249');
  let invalidCsvRejected = false;
  try { summarizeSeeLotWorkbook(new TextEncoder().encode(csvText + '"unterminated'), 'BAD.csv'); } catch { invalidCsvRejected = true; }
  check('See LOT rejects malformed CSV quoting', invalidCsvRejected);
  let invalidCsvHeader = false;
  try { summarizeSeeLotWorkbook(new TextEncoder().encode('LOTID,VALUE\nA,1'), 'BAD.csv'); } catch { invalidCsvHeader = true; }
  check('See LOT rejects unrelated CSV headers', invalidCsvHeader);
  const csvForm = new FormData(); csvForm.set('action', 'preview');
  csvForm.append('files', new File([csvBytes], '0000123.CSV', { type: 'text/csv' }));
  csvForm.append('files', new File([trackerBytes], 'TRACKER-X.xls'));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: csvForm, headers: viewerHeaders }), env, {});
  text = await res.text();
  check('members can preview CSV and Excel together and select CSV in the upload form', res.status === 200 && text.includes('0000123') && text.includes('TRACKER-X') && text.includes('99.6%') && text.includes('accept=".csv,.xls,.xlsx"'));

  const splitParent = summarizeSeeLotWorkbook(makeSeeLotBook([
    ['Split', '9/16/26 8:00', 11, 'M165', '-', 'VMDL', 'tester', '', 'TRACKER-CHILD', 48, 'auto split'],
    ['TrackOut', '9/16/26 7:00', 59, 'M164', 'FVI-01', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/16/26 6:00', 59, 'M164', 'FVI-01', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackOut', '9/16/26 5:00', 59, 'M130', 'AI-H910', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/16/26 4:00', 59, 'M130', 'AI-H910', 'VMDL', 'tester', '', '', 0, ''],
  ]), 'TRACKER-PARENT.xls', 'PART-1');
  const splitChild = summarizeSeeLotWorkbook(makeSeeLotBook([
    ['TrackOut', '9/16/26 12:00', 48, 'M170', 'PK-M101', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/16/26 11:00', 48, 'M170', 'PK-M101', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackOut', '9/16/26 10:00', 48, 'M165', 'OQC-01', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/16/26 9:00', 48, 'M165', 'OQC-01', 'VMDL', 'tester', '', '', 0, ''],
  ]), 'TRACKER-CHILD.xls');
  const splitRows = buildTrackerReportRows([splitParent, splitChild]);
  check('tracker report expands split LOTs and attaches uploaded child process data', splitRows.length === 2 && splitRows[0].lotNo === 'TRACKER-PARENT' && splitRows[0].lotSplit === 'TRACKER-CHILD' && splitRows[0].m165.in === '48' && splitRows[0].m170.out === '48' && splitRows[1].lotSplit === 'TRACKER-PARENT' && splitRows[1].splitQty === '11');
  check('tracker text report uses the requested two-row tab-delimited headers', trackerReportText(splitRows).startsWith("PART NO\tLOT NO\tQ'ty\tM121/M130 (INTERFACE)") && trackerReportText(splitRows).includes("\r\n\t\t\tEQP\tIN\tOUT\tSCRAP\tFAIL\tYLD"));

  const splitOriginBytes = makeSeeLotBook([
    ['TrackOut', '9/16/26 10:00', 48, 'M033', 'EQP-33', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/16/26 9:00', 48, 'M033', 'EQP-33', 'VMDL', 'tester', '', '', 0, ''],
    ['Split', '9/16/26 8:00', 48, 'M165', '-', 'VMDL', 'tester', '', 'H1194A0638', 48, 'auto split'],
  ]);
  const splitOrigin = summarizeSeeLotWorkbook(splitOriginBytes, 'H1195M0638.xls');
  check('tracker detects a split LOT file required from the oldest See LOT event', splitOrigin.originSplitLotIds.join() === 'H1194A0638');
  db.prepare("INSERT INTO tech_lot_info(lot_id,data_json,source_filename,imported_by) VALUES('H119000638',?,'existing.xlsx',?)")
    .run(JSON.stringify({ LOTID: 'H119000638', PART_NUMBER: 'PART-SMT-RUN' }), viewerId);
  const splitRequestForm = new FormData(); splitRequestForm.set('action', 'preview');
  splitRequestForm.append('files', new File([splitOriginBytes], 'H1195M0638.xls', { type: 'application/vnd.ms-excel' }));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: splitRequestForm, headers: viewerHeaders }), env, {});
  text = await res.text();
  check('split-origin preview requests the exact additional See LOT file without inferring a RUNID part number', res.status === 200 && text.includes(trackerWords.ko.splitMissing) && text.includes('H1194A0638') && !text.includes('PART-SMT-RUN'));
  check('internal LOT interpretation is not exposed in the report UI', !text.includes('HYV') && !text.includes('Serial') && !text.includes('ISOweeknum'));
  const splitRequestedBytes = makeSeeLotBook([
    ['TrackOut', '9/16/26 12:00', 48, 'M170', 'PK-M101', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/16/26 11:00', 48, 'M170', 'PK-M101', 'VMDL', 'tester', '', '', 0, ''],
  ]);
  const splitCompleteForm = new FormData(); splitCompleteForm.set('action', 'preview');
  splitCompleteForm.append('files', new File([splitOriginBytes], 'H1195M0638.xls', { type: 'application/vnd.ms-excel' }));
  splitCompleteForm.append('files', new File([splitRequestedBytes], 'H1194A0638.xls', { type: 'application/vnd.ms-excel' }));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: splitCompleteForm, headers: viewerHeaders }), env, {});
  text = await res.text();
  check('supplying the requested split file clears the request without inferring an unverified RUNID part number', res.status === 200 && !text.includes(trackerWords.ko.splitMissing) && !text.includes('PART-SMT-RUN'));

  const runHeader = ['No','REPRSN_SRLNO','LOT_ID','BARCODE_SERLNO','PROD_ID','SPLIT_LOT','RESERVE_ID','PS_PROC','FW_PROC','TEST_RESULT','PCB_ARRAY','MERGE_LOT','PCB_MAP','WORK_NAME','FRONT_RESULT','BACK_RESULT','FRONT_SCRAP_CODE','BACK_SCRAP_CODE','CREATE_DATE'];
  const runCsvBytes = new TextEncoder().encode([
    runHeader.join(','),
    '1,SERIAL-1,H119000638,SERIAL-1,PART-FROM-RUNID,H1193O0638,-,0,0,,6,H1194A0638,MAP,S_AOI,OK,OK,,,20260918133303',
    '2,SERIAL-2,H119000638,SERIAL-2,PART-FROM-RUNID,H119470638,-,0,0,,6,H1194A0638,MAP,S_AOI,OK,OK,,,20260918134447',
    'Department : Production Technical,,,,,,,,,,,,,,,,,,',
  ].join('\r\n'));
  const runMetadata = summarizeRunMetadata(runCsvBytes, 'H119000638.csv');
  check('initial-input RUNID CSV extracts one product and its merge LOT links', runMetadata.partNumber === 'PART-FROM-RUNID' && runMetadata.mergeLotIds.join() === 'H1194A0638');
  const runUnlinkedForm = new FormData(); runUnlinkedForm.set('action', 'preview');
  runUnlinkedForm.append('files', new File([splitOriginBytes], 'H1195M0638.xls', { type: 'application/vnd.ms-excel' }));
  runUnlinkedForm.append('files', new File([runCsvBytes], 'H119000638.csv', { type: 'text/csv' }));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: runUnlinkedForm, headers: viewerHeaders }), env, {});
  text = await res.text();
  check('indirect RUNID link is retained, labeled, and still requests the missing history file', res.status === 200 && text.includes(trackerWords.ko.runIndirect) && text.includes('H119000638 → H1194A0638 → H1195M0638') && text.includes('PART-FROM-RUNID') && text.includes(trackerWords.ko.splitMissing) && text.includes('H1194A0638'));
  const directOriginBytes = makeSeeLotBook([
    ['TrackOut', '9/16/26 10:00', 48, 'M033', 'EQP-33', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/16/26 9:00', 48, 'M033', 'EQP-33', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackOut', '9/16/26 8:45', 48, 'M015', 'SMT-2', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/16/26 8:30', 48, 'M015', 'SMT-2', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackOut', '9/16/26 8:25', 48, 'M010', 'SMT-1', 'VMDL', 'tester', '', '', 0, ''],
    ['TrackIn', '9/16/26 8:10', 48, 'M010', 'SMT-1', 'VMDL', 'tester', '', '', 0, ''],
    ['Split', '9/16/26 8:00', 48, 'M010', '-', 'VMDL', 'tester', '', 'H0Z3000638', 48, ''],
  ]);
  const directRunCsvBytes = new TextEncoder().encode([
    runHeader.join(','),
    '1,SERIAL-1,H0Z3000638,SERIAL-1,PART-DIRECT,H0Z31D0638,-,0,0,,6,H0Z3010638,MAP,S_AOI,OK,OK,,,20260918105135',
  ].join('\r\n'));
  const runLinkedForm = new FormData(); runLinkedForm.set('action', 'preview');
  runLinkedForm.append('files', new File([directOriginBytes], 'H0Z3010638.xls', { type: 'application/vnd.ms-excel' }));
  runLinkedForm.append('files', new File([directRunCsvBytes], 'H0Z3000638.csv', { type: 'text/csv' }));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: runLinkedForm, headers: viewerHeaders }), env, {});
  text = await res.text();
  check('direct RUNID link is labeled and supplies its product ID without requesting complete prior history', res.status === 200 && text.includes(trackerWords.ko.runDirect) && text.includes('H0Z3000638 → H0Z3010638') && !text.includes(trackerWords.ko.splitMissing) && text.includes('PART-DIRECT'));
  const unrelatedRunCsvBytes = new TextEncoder().encode([
    runHeader.join(','),
    '1,SERIAL-1,H999000638,SERIAL-1,PART-UNRELATED,H9991A0638,-,0,0,,6,H9991G0638,MAP,S_AOI,OK,OK,,,20260918105135',
  ].join('\r\n'));
  const partialForm = new FormData(); partialForm.set('action', 'preview');
  partialForm.append('files', new File([directOriginBytes], 'H0Z3010638.xls', { type: 'application/vnd.ms-excel' }));
  partialForm.append('files', new File([unrelatedRunCsvBytes], 'H999000638.csv', { type: 'text/csv' }));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: partialForm, headers: viewerHeaders }), env, {});
  text = await res.text();
  check('an unlinked RUNID warns without stopping the available event report', res.status === 200 && text.includes(trackerWords.ko.runUnlinked) && text.includes('H0Z3010638') && !text.includes('PART-UNRELATED'));
  const runOnlyForm = new FormData(); runOnlyForm.set('action', 'preview');
  runOnlyForm.append('files', new File([runCsvBytes], 'H119000638.csv', { type: 'text/csv' }));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: runOnlyForm, headers: viewerHeaders }), env, {});
  text = await res.text();
  check('RUNID-only upload displays an actionable error in the upload card', res.status === 400 && text.includes('id="lot-tracker-error"') && text.includes(trackerWords.ko.noEventFiles));
  const unsupportedForm = new FormData(); unsupportedForm.set('action', 'preview');
  unsupportedForm.append('files', new File([new TextEncoder().encode('LOTID,VALUE\nA,1')], 'WRONG.csv', { type: 'text/csv' }));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: unsupportedForm, headers: viewerHeaders }), env, {});
  text = await res.text();
  check('unsupported upload displays the filename and accepted CSV types', res.status === 400 && text.includes('id="lot-tracker-error"') && text.includes('WRONG.csv') && text.includes(trackerWords.ko.invalidHeader));

  db.prepare("INSERT INTO tech_lot_info(lot_id,data_json,source_filename,imported_by) VALUES('TRACKER-A',?,'existing.xlsx',?)").run(JSON.stringify({ LOTID: 'TRACKER-A', PART_NUMBER: 'PART-FROM-LOT-INFO', KEEP: 'preserved' }), viewerId);
  const trackerForm = new FormData();
  trackerForm.set('action', 'preview');
  trackerForm.append('files', new File([trackerBytes], 'TRACKER-A.xls', { type: 'application/vnd.ms-excel' }));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: trackerForm, headers: viewerHeaders }), env, {});
  text = await res.text();
  check('members can preview raw See LOT files with existing PART NO joined', res.status === 200 && text.includes('LOT Tracker 보고서') && text.includes('PART-FROM-LOT-INFO') && text.includes('4583*1') && text.includes('Hold M165'));
  const encodedTrackerPayload = text.match(/name="payload" value="([^"]+)"/)?.[1] || '';
  const trackerPayload = encodedTrackerPayload.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
  const applyTrackerForm = new FormData(); applyTrackerForm.set('action', 'apply'); applyTrackerForm.set('payload', trackerPayload);
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: applyTrackerForm, headers: viewerHeaders }), env, {});
  const savedTracker = JSON.parse(db.prepare("SELECT data_json FROM tech_lot_info WHERE lot_id='TRACKER-A'").get().data_json);
  check('members can save validated tracker results while preserving unrelated LOT INFO', res.status === 303 && res.headers.get('location') === '/lot-tracker?saved=1' && savedTracker.PART_NUMBER === 'PART-FROM-LOT-INFO' && savedTracker.KEEP === 'preserved' && savedTracker.INTERFACE_YLD === '99.7%' && savedTracker.STATUS === 'Hold M165');
  const downloadTrackerForm = new FormData(); downloadTrackerForm.set('action', 'download'); downloadTrackerForm.set('payload', trackerPayload);
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: downloadTrackerForm, headers: viewerHeaders }), env, {});
  const reportBook = readXlsx(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
  const reportRows = xlsxUtils.sheet_to_json(reportBook.Sheets['LOT Tracker'], { header: 1, raw: false, defval: '' });
  check('tracker Excel download contains the requested grouped report headers and data', res.status === 200 && res.headers.get('content-type').includes('spreadsheetml') && reportRows[0][0] === 'PART NO' && reportRows[0][3] === 'M121/M130 (INTERFACE)' && reportRows[2][1] === 'TRACKER-A');
  const invalidTrackerBook = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(invalidTrackerBook, xlsxUtils.aoa_to_sheet([['BAD HEADER'], ['bad']]), 'Sheet1');
  const invalidTrackerBytes = new Uint8Array(writeXlsx(invalidTrackerBook, { type: 'array', bookType: 'biff8' }));
  const invalidTrackerForm = new FormData(); invalidTrackerForm.set('action', 'preview'); invalidTrackerForm.append('files', new File([invalidTrackerBytes], 'BAD.xls', { type: 'application/vnd.ms-excel' }));
  res = await worker.fetch(new Request('https://x/lot-tracker', { method: 'POST', body: invalidTrackerForm, headers: viewerHeaders }), env, {});
  check('tracker rejects workbooks that are not See LOT exports', res.status === 400 && (await res.text()).includes(trackerWords.ko.invalidHeader));
  res = await worker.fetch(new Request('https://x/lot-tracker', { headers: viewerHeaders }), env, {});
  text = await res.text();
  check('LOT Tracker page exposes the future SWP LOTID flow and current multi-file upload', res.status === 200 && text.includes('name="files"'));
  check('LOT Tracker shows the working file upload first and keeps the pending SWP lookup collapsed below',
    text.includes('class="lot-upload-form"') && text.indexOf('name="files"') < text.indexOf('<details class="card daily-followup lot-pending">'));

  const lotForm = combinedForm();
  lotForm.set(`field_${standardFieldIds.LOTID}`, ' 0000123 \r\nLOT-B\n0000123');
  res = await combinedPost(lotForm);
  const lotItemId = idFromLocation(res);
  const lotStored = db.prepare('SELECT v.* FROM tech_daily_update_value v JOIN tech_daily_update u ON u.id=v.update_id WHERE u.item_id=? AND v.field_id=?').get(lotItemId, standardFieldIds.LOTID);
  check('LOTID report value trims and deduplicates without translation', res.status === 302 && lotStored.value === '0000123\nLOT-B' && lotStored.value_en === lotStored.value && lotStored.value_vi === lotStored.value);
  const oversizedLot = combinedForm(); oversizedLot.set(`field_${standardFieldIds.LOTID}`, 'A'.repeat(121));
  const beforeInvalidLot = dailyCounts();
  res = await combinedPost(oversizedLot);
  check('invalid report LOTID is rejected before any writes', res.status === 400 && dailyCounts() === beforeInvalidLot);
  // Simulate definitions and a report from a production database upgraded in place.
  const archivedFieldId = Number(db.prepare("INSERT INTO tech_daily_field(label,input_type,sort_order) VALUES('작업내용','textarea',100)").run().lastInsertRowid);
  const archivedUpdateId = db.prepare('SELECT id FROM tech_daily_update WHERE item_id=?').get(lotItemId).id;
  db.prepare("INSERT INTO tech_daily_update_value(update_id,field_id,value,value_en,value_vi) VALUES(?,?,'보존할 과거 이력','Historical work','Lịch sử')").run(archivedUpdateId, archivedFieldId);
  const beforeMigration = dailyCounts();
  db.exec(fs.readFileSync('./database/migrations/lot-info-migration.sql', 'utf8'));
  db.exec(fs.readFileSync('./database/migrations/lot-info-migration.sql', 'utf8'));
  check('LOT migration is repeatable and preserves historical rows', dailyCounts() === beforeMigration && db.prepare("SELECT COUNT(*) count FROM tech_daily_field WHERE label='LOTID'").get().count === 1);
  for (const route of ['/daily-items', '/daily-fields', '/daily-fields/export']) {
    res = await worker.fetch(new Request('https://x' + route, { headers: adminHeaders2 }), env, {});
    text = await res.text();
    check(`retired report field excluded from ${route}`, res.status === 200 && !text.includes('작업내용'));
    if (route === '/daily-items') check('new-item LOT lookup script is attached', text.includes("fetch('/api/lot-info?ids='"));
  }
  res = await worker.fetch(new Request(`https://x/daily-items/${lotItemId}`, { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check('historical field label and value still display but cannot be entered', text.includes('작업내용: 보존할 과거 이력') && !text.includes(`name="field_${archivedFieldId}"`));
  res = await worker.fetch(new Request('https://x/daily-reports?date=2026-09-15', { headers: adminHeaders2 }), env, {});
  text = await res.text();
  check('report view preserves archived field label and value', text.includes('보존할 과거 이력'));
  res = await worker.fetch(new Request(`https://x/daily-fields/${archivedFieldId}`, { headers: adminHeaders2 }), env, {});
  check('retired field detail is unavailable in settings', res.status === 404);
  res = await worker.fetch(new Request('https://x/daily-fields/new', { method: 'POST', headers: { ...adminHeaders2, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: '작업내용', input_type: 'textarea' }) }), env, {});
  check('removed report field cannot be recreated from settings', res.status === 400);
  const staleReportForm = combinedForm(); staleReportForm.set(`field_${archivedFieldId}`, 'must not save');
  res = await combinedPost(staleReportForm);
  check('stale clients cannot save retired report values', res.status === 302 && !db.prepare("SELECT 1 FROM tech_daily_update_value WHERE value='must not save'").get());


  await testLotSteps({ check, env, viewerHeaders });
  await testUserManagement({ db, env, check, adminHeaders: adminHeaders2 });
  await testTranslationEfficiency({ check, makeEnv: (database) => ({ DB: new D1Shim(database) }) });
  await testNewFeatures({ check, env, db, adminHeaders: adminHeaders2 });
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
