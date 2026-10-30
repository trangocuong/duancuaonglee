/**
 * Feature-Based Internationalization (i18n) Engine
 *
 * Gom từ điển từ từng domain:
 *  - common.js: Từ ngữ dùng chung (nút bấm, thông báo, modal)
 *  - auth.js: Xác thực, đổi mật khẩu, phân quyền
 *  - nav.js: Điều hướng, menu, phiên bản
 *  - daily.js: Báo cáo hằng ngày, CSV, trạng thái
 *  - lot.js: LOT Tracker, step reports, follow-up
 *  - master.js: Dữ liệu chuẩn (Master data)
 */

import { DAILY_WORK_STATUS_DEFINITIONS } from "../config/daily-config.js";
import { COMMON_DICTIONARY } from "./common.js";
import { AUTH_DICTIONARY } from "./auth.js";
import { NAV_DICTIONARY } from "./nav.js";
import { DAILY_DICTIONARY } from "./daily.js";
import { LOT_DICTIONARY } from "./lot.js";
import { MASTER_DICTIONARY } from "./master.js";

export { COMMON_DICTIONARY } from "./common.js";
export { AUTH_DICTIONARY } from "./auth.js";
export { NAV_DICTIONARY } from "./nav.js";
export { DAILY_DICTIONARY } from "./daily.js";
export { LOT_DICTIONARY } from "./lot.js";
export { MASTER_DICTIONARY } from "./master.js";

export const SIGNUP_EMAIL_DOMAIN = "hanyangdgtvina.com";
export const RESET_TOKEN_TTL_MINUTES = 30;

export const LANGS = ["ko", "en", "vi"];
export const DEFAULT_LANG = "ko";
export const LANG_NAMES = { ko: "한국어", en: "English", vi: "Tiếng Việt" };

export const DICTIONARY = {
  ...COMMON_DICTIONARY,
  ...AUTH_DICTIONARY,
  ...NAV_DICTIONARY,
  ...DAILY_DICTIONARY,
  ...LOT_DICTIONARY,
  ...MASTER_DICTIONARY,
};

export const I18N = { ko: {}, en: {}, vi: {} };

for (const [key, trans] of Object.entries(DICTIONARY)) {
  if (trans && typeof trans === "object") {
    if (trans.ko !== undefined) I18N.ko[key] = trans.ko;
    if (trans.en !== undefined) I18N.en[key] = trans.en;
    if (trans.vi !== undefined) I18N.vi[key] = trans.vi;
  }
}

export const STATUS_OPTIONS = ["검토중", "조치중", "완료", "보류"];
export const PRIORITY_OPTIONS = ["상", "중", "하"];
export const WORK_CATEGORIES = ["평가", "불량분석", "이슈대응", "설비점검 모니터링"];

export const STANDARD_OPTION_LABELS = {
  "평가": { en: "Evaluation", vi: "Đánh giá" },
  "불량분석": { en: "Defect Analysis", vi: "Phân tích lỗi" },
  "이슈대응": { en: "Issue Response", vi: "Xử lý sự cố" },
  "설비점검 모니터링": { en: "Equipment Inspection / Monitoring", vi: "Kiểm tra / Giám sát thiết bị" },
  LOT_TRACER: { ko: "LOT Tracer", en: "LOT Tracer", vi: "LOT Tracer" },
  SWP_EXCEL_IMPORT: { ko: "SWP Excel Import", en: "SWP Excel Import", vi: "Nhập Excel SWP" },
};

export const DAILY_STATUS_LABELS = Object.fromEntries(
  DAILY_WORK_STATUS_DEFINITIONS.map(([code, ko, en, vi]) => [code, { ko, en, vi }])
);
DAILY_STATUS_LABELS.ON_HOLD = { ko: "보류", en: "On Hold", vi: "Tạm hoãn" };

export const LEGACY_DAILY_STATUS_CODES = {
  "대기": "WAITING", Waiting: "WAITING", "Chờ xử lý": "WAITING",
  "진행중": "IN_PROGRESS", "In Progress": "IN_PROGRESS", "Đang tiến hành": "IN_PROGRESS",
  "진행 중": "IN_PROGRESS",
  "지연": "DELAYED", Delayed: "DELAYED", "Chậm tiến độ": "DELAYED",
  "진행 제한": "RESTRICTED", Restricted: "RESTRICTED", "Hạn chế tiến hành": "RESTRICTED",
  "이슈": "ISSUE", "문제 발생": "ISSUE", Issue: "ISSUE", "Có sự cố": "ISSUE", "Phát sinh vấn đề": "ISSUE", NG: "ISSUE",
  "보류": "ON_HOLD", "On Hold": "ON_HOLD", "Tạm hoãn": "ON_HOLD", "Tạm dừng": "ON_HOLD",
  "완료": "COMPLETED", Completed: "COMPLETED", Done: "COMPLETED", "Hoàn thành": "COMPLETED",
  "예정": "PLANNED", Planned: "PLANNED", "Dự kiến": "PLANNED",
  "승인대기": "APPROVAL_PENDING", "Approval Pending": "APPROVAL_PENDING", "Chờ phê duyệt": "APPROVAL_PENDING",
  "재작업": "REWORK", Rework: "REWORK", "Làm lại": "REWORK",
  "검토 중": "UNDER_REVIEW", "Under Review": "UNDER_REVIEW", "Đang xem xét": "UNDER_REVIEW",
  "QA 인계": "QA_HANDOFF", "QA Handoff": "QA_HANDOFF", "Bàn giao QA": "QA_HANDOFF",
};

function parseCookies(request) {
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

export function langCookie(lang) {
  return `lang=${encodeURIComponent(lang)}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`;
}

export function getLang(request, user) {
  const cookies = parseCookies(request);
  const fromCookie = cookies["lang"];
  if (fromCookie && LANGS.includes(fromCookie)) return fromCookie;
  if (user && user.preferred_lang && LANGS.includes(user.preferred_lang)) return user.preferred_lang;
  const accept = request.headers.get("accept-language") || "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (LANGS.includes(code)) return code;
  }
  return DEFAULT_LANG;
}

export function t(lang) {
  return I18N[lang] || I18N[DEFAULT_LANG];
}

export function registerFeatureTranslations(features) {
  for (const [key, val] of Object.entries(features)) {
    if (typeof val === "object" && val !== null) {
      if (val.ko !== undefined) I18N.ko[key] = val.ko;
      if (val.en !== undefined) I18N.en[key] = val.en;
      if (val.vi !== undefined) I18N.vi[key] = val.vi;
      DICTIONARY[key] = val;
    }
  }
}
