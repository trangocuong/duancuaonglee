// Utility helpers extracted from worker.js
// Import SIGNUP_EMAIL_DOMAIN from i18n.js (not defined here since worker.js defines it as a local const)

const PBKDF2_ITERATIONS = 100000;
export const SIGNUP_EMAIL_DOMAIN = "hanyangdgtvina.com";
const BUSINESS_TIME_ZONE = "Asia/Bangkok";

export const COMMON_SECURITY_HEADERS = {
  "cache-control": "no-store",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

export const HTML_SECURITY_HEADERS = {
  ...COMMON_SECURITY_HEADERS,
  "content-security-policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
};

// ---------- 유틸 ----------

// #region HTTP 응답 & 보안 유틸 — json/html, CSRF 체크, 날짜 검증

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...COMMON_SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

export function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...HTML_SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" },
  });
}

export function plainText(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...COMMON_SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" },
  });
}

export function isSameOriginMutation(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === expectedOrigin;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch (e) {
      return false;
    }
  }
  // 브라우저 외 클라이언트와 기존 API 호환성은 유지한다. 브라우저의 교차 출처 POST는
  // Origin/Referer가 포함되므로 위에서 거부되고, 세션 쿠키의 SameSite=Lax도 함께 방어한다.
  return true;
}

export function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function businessDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function randomToken(n = 32) {
  return bytesToBase64(randomBytes(n)).replace(/[^a-zA-Z0-9]/g, "").slice(0, n);
}

// #endregion

// #region 비밀번호 해싱 & 세션 쿠키

export async function pbkdf2(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    keyMaterial, 256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt);
  return { salt: bytesToBase64(salt), hash: bytesToBase64(hash) };
}

export async function verifyPassword(password, saltB64, hashB64) {
  const salt = base64ToBytes(saltB64);
  const hash = await pbkdf2(password, salt);
  const expected = base64ToBytes(hashB64);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

export function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

export function sessionCookie(token, maxAgeSeconds) {
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearedSessionCookie() {
  return `session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function redirect(location, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { ...COMMON_SECURITY_HEADERS, location, ...extraHeaders } });
}

export function isAllowedSignupEmail(username) {
  const re = new RegExp(`^[^\\s@]+@${SIGNUP_EMAIL_DOMAIN.replace(/\./g, "\\.")}$`, "i");
  return re.test(username);
}

// #endregion
