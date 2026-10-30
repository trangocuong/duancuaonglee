/**
 * Translation Service — Language detection, Cloudflare Workers AI translation, D1 cache, and display mapping
 */

import {
  LANGS,
  STANDARD_OPTION_LABELS,
  DAILY_STATUS_LABELS,
  LEGACY_DAILY_STATUS_CODES,
} from "../../i18n/index.js";

export function normalizeDailyStatusCode(value) {
  const normalized = String(value || "").trim();
  const upper = normalized.toUpperCase();
  if (DAILY_STATUS_LABELS[upper]) return upper;
  return LEGACY_DAILY_STATUS_CODES[normalized] || null;
}

export function resolveStandardOptionValue(value, lang) {
  const statusCode = normalizeDailyStatusCode(value);
  if (statusCode) return DAILY_STATUS_LABELS[statusCode][lang] || DAILY_STATUS_LABELS[statusCode].ko;
  const translated = STANDARD_OPTION_LABELS[value];
  return translated && translated[lang] ? translated[lang] : value;
}

export const AI_TRANSLATE_MODEL = "@cf/meta/m2m100-1.2b";

// 한국어/영어/베트남어 중 아무 언어로나 입력해도 어떤 언어인지 스스로 판별한다. 한글과
// 베트남어 전용 문자는 문자 범위로 확정하고, 성조부호를 생략한 베트남어는 자주 쓰는 업무
// 단어 조합을 함께 본다. 예전에는 모든 ASCII 문장을 영어로 간주해서 "Uu tien cong viec"
// 같은 베트남어가 잘못 번역되는 문제가 있었다.
export function detectTextLanguage(text) {
  if (/[가-힣ᄀ-ᇿ㄰-㆏]/.test(text)) return "ko";
  if (/[ăâđêôơưĂÂĐÊÔƠƯàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i.test(text)) return "vi";
  const words = String(text || "").toLowerCase().match(/[a-z]+/g) || [];
  const vietnameseWords = new Set([
    "anh", "bao", "bi", "can", "cho", "chua", "co", "cong", "cua", "da", "dang", "den",
    "duoc", "gia", "giam", "hang", "hoan", "hom", "khong", "kiem", "khi", "lam", "loi",
    "moi", "ngay", "nhan", "noi", "phan", "phat", "qua", "san", "sau", "sua", "tai",
    "thanh", "thiet", "theo", "tien", "tiep", "toi", "trong", "truoc", "tu", "uu", "viec",
    "xu", "yeu",
  ]);
  const englishWords = new Set([
    "and", "are", "complete", "completed", "current", "defect", "done", "equipment", "for", "from",
    "inspection", "issue", "next", "not", "process", "progress", "report", "result", "sample", "test",
    "the", "this", "today", "was", "with", "work",
  ]);
  const viScore = words.filter((word) => vietnameseWords.has(word)).length;
  const enScore = words.filter((word) => englishWords.has(word)).length;
  if (viScore >= 2 && viScore > enScore) return "vi";
  return "en";
}

// Workers AI로 text를 sourceLangCode에서 targetLangCode로 번역한다. 실패해도(모델 오류,
// AI 바인딩 없음 등) 조용히 null을 반환 — 호출부가 원문으로 폴백하는 걸 책임짐.
export async function translateText(env, text, sourceLangCode, targetLangCode) {
  if (!env.AI || !text) return null;
  try {
    const result = await env.AI.run(AI_TRANSLATE_MODEL, {
      text,
      source_lang: sourceLangCode,
      target_lang: targetLangCode,
    });
    const translated = result && result.translated_text;
    return translated ? String(translated).trim() : null;
  } catch (err) {
    console.log("translateText failed:", err && err.message);
    return null;
  }
}

// rawText(세 언어 중 아무거나)로부터 ko/en/vi 세 값을 전부 채운다. 입력된 언어의 값은
// 원문 그대로 쓰고, 나머지 두 값은 거기서 번역한다(두 번역을 동시에 호출해서 지연을
// 절반으로 줄임). 번역이 실패한 언어는 null — NOT NULL 제약이 있는 호출부(필드 이름의
// label 컬럼 등)는 반드시 자기 쪽에서 `결과.ko || rawText` 식으로 원문 폴백을 챙길 것.
export async function resolveTrilingualText(env, rawText) {
  const text = String(rawText || "").trim();
  if (!text) return { ko: null, en: null, vi: null };
  const detected = detectTextLanguage(text);
  const targets = ["ko", "en", "vi"].filter((l) => l !== detected);
  const [first, second] = await Promise.all(
    targets.map(async (target) => (await buildDisplayTranslationMap(env, [text], target, false)).get(text) || null)
  );
  const byLang = { [detected]: text, [targets[0]]: first, [targets[1]]: second };
  return { ko: byLang.ko, en: byLang.en, vi: byLang.vi };
}

export const TRANSLATION_CACHE_COLUMNS = { ko: "value_ko", en: "value_en", vi: "value_vi" };
export const TRANSLATION_CONCURRENCY = 6;

export function hasTranslatableText(value) {
  return /\p{L}/u.test(String(value || ""));
}

export async function mapWithConcurrency(values, limit, callback) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await callback(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// 번역 컬럼이 없는 사용자 입력도 UI 언어에 맞춰 표시할 수 있도록 원문별 번역을 D1에
// 보관한다. 표준 선택지는 수동 검수된 사전을 우선하고, 그 밖의 값만 Workers AI를 쓴다.
// 캐시 테이블이 아직 만들어지지 않았거나 AI가 일시 실패해도 페이지 자체는 원문으로
// 정상 표시되고, 다음 조회 때 다시 번역을 시도한다.
export async function buildDisplayTranslationMap(env, rawValues, targetLang, fallbackToSource = true) {
  const output = new Map();
  const values = [...new Set(rawValues.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!values.length || !LANGS.includes(targetLang)) return output;

  const pending = [];
  for (const value of values) {
    const standard = resolveStandardOptionValue(value, targetLang);
    if (standard !== value || detectTextLanguage(value) === targetLang || !hasTranslatableText(value)) {
      output.set(value, standard);
    } else {
      pending.push(value);
    }
  }
  if (!pending.length) return output;

  const cachedByText = new Map();
  try {
    for (let offset = 0; offset < pending.length; offset += 50) {
      const chunk = pending.slice(offset, offset + 50);
      const rows = await env.DB.prepare(
        `SELECT source_text, source_lang, value_ko, value_en, value_vi
           FROM tech_translation_cache WHERE source_text IN (${chunk.map(() => "?").join(",")})`
      ).bind(...chunk).all();
      for (const row of rows.results) cachedByText.set(row.source_text, row);
    }
  } catch (err) {
    console.log("translation cache read failed:", err && err.message);
  }

  const targetColumn = TRANSLATION_CACHE_COLUMNS[targetLang];
  const missing = [];
  for (const value of pending) {
    const cached = cachedByText.get(value);
    if (cached && cached[targetColumn]) output.set(value, cached[targetColumn]);
    else missing.push({ value, sourceLang: cached?.source_lang || detectTextLanguage(value) });
  }

  const translatedRows = await mapWithConcurrency(missing, TRANSLATION_CONCURRENCY, async ({ value, sourceLang }) => {
    const translated = await translateText(env, value, sourceLang, targetLang);
    if (!translated) return null;
    output.set(value, translated);
    const row = { sourceText: value, sourceLang, ko: null, en: null, vi: null };
    row[sourceLang] = value;
    row[targetLang] = translated;
    return row;
  });

  const cacheRows = translatedRows.filter(Boolean);
  try {
    for (let offset = 0; offset < cacheRows.length; offset += 50) {
      const chunk = cacheRows.slice(offset, offset + 50);
      const statements = chunk.map((row) => env.DB.prepare(
        `INSERT INTO tech_translation_cache (source_text, source_lang, value_ko, value_en, value_vi)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_text) DO UPDATE SET
           value_ko = COALESCE(tech_translation_cache.value_ko, excluded.value_ko),
           value_en = COALESCE(tech_translation_cache.value_en, excluded.value_en),
           value_vi = COALESCE(tech_translation_cache.value_vi, excluded.value_vi),
           updated_at = datetime('now')`
      ).bind(row.sourceText, row.sourceLang, row.ko, row.en, row.vi));
      if (statements.length === 1) await statements[0].run();
      else await env.DB.batch(statements);
    }
  } catch (err) {
    console.log("translation cache write failed:", err && err.message);
  }

  for (const value of missing.map((item) => item.value)) {
    if (fallbackToSource && !output.has(value)) output.set(value, value);
  }
  return output;
}

export async function warmTranslationCache(env, rawValues) {
  for (const lang of LANGS) await buildDisplayTranslationMap(env, rawValues, lang);
}

export function translatedText(value, translationMap) {
  const text = String(value || "").trim();
  return text ? (translationMap.get(text) || text) : "";
}
