-- 2026-09-03: UI 언어별 사용자 입력 번역 캐시
-- CREATE TABLE IF NOT EXISTS이므로 운영 DB에 재실행해도 안전하다.
CREATE TABLE IF NOT EXISTS tech_translation_cache (
  source_text TEXT PRIMARY KEY,
  source_lang TEXT NOT NULL CHECK (source_lang IN ('ko','en','vi')),
  value_ko TEXT,
  value_en TEXT,
  value_vi TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
