-- Additive and repeatable. Does not delete reports, values or existing field definitions.
CREATE TABLE IF NOT EXISTS tech_lot_info (
  lot_id TEXT PRIMARY KEY CHECK(length(lot_id) BETWEEN 1 AND 120),
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  source_filename TEXT NOT NULL,
  imported_by INTEGER REFERENCES techops_users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO tech_daily_field(label,label_en,label_vi,input_type,sort_order)
SELECT 'LOTID','LOTID','LOTID','textarea',80
WHERE NOT EXISTS(SELECT 1 FROM tech_daily_field WHERE label='LOTID')
AND (SELECT COUNT(DISTINCT label) FROM tech_daily_field WHERE label IN ('소속부서','업무구분','업무유형','중분류','소분류'))=5;
