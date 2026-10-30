-- YieldOps 제품기술 업무관리 (techops) — 신규 DB 스키마
-- 6개 테이블: 인증 3개(techops_*) + 업무관리 3개(tech_*)

CREATE TABLE IF NOT EXISTS techops_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  email_verified_at TEXT,
  preferred_lang TEXT DEFAULT 'ko',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS techops_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES techops_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_techops_sessions_user ON techops_sessions(user_id);

CREATE TABLE IF NOT EXISTS techops_login_attempts (
  username TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_attempt_at TEXT
);

CREATE TABLE IF NOT EXISTS techops_password_resets (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES techops_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_techops_password_resets_user ON techops_password_resets(user_id);

CREATE TABLE IF NOT EXISTS techops_email_verifications (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES techops_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_techops_email_verifications_user ON techops_email_verifications(user_id);

CREATE TABLE IF NOT EXISTS tech_task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT '검토중' CHECK (status IN ('검토중','조치중','완료','보류')),
  priority TEXT NOT NULL DEFAULT '중' CHECK (priority IN ('상','중','하')),
  owner TEXT,
  due_date TEXT,
  completed_at TEXT,
  created_by INTEGER REFERENCES techops_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (status = '완료' AND completed_at IS NOT NULL) OR
    (status <> '완료' AND completed_at IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_tech_task_status ON tech_task(status);
CREATE INDEX IF NOT EXISTS idx_tech_task_owner ON tech_task(owner);

CREATE TABLE IF NOT EXISTS tech_update (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tech_task(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id INTEGER REFERENCES techops_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_update_task ON tech_update(task_id);

-- SSD / Module 파트 일일업무보고 (엑셀 시트 원본 구조를 그대로 담는 테이블)
-- status/category 는 파트별로 값 체계가 완전히 달라(SSD: ING/Done/Waitting,
-- Module: STEP3/입력대기/진행 중/결과 송부 …) 자유 텍스트로 두고 CHECK 제약을 걸지 않는다.
-- 원본 시트의 병합 셀 때문에 title/category 가 비어 있는 행이 있어 NOT NULL 을 걸지 않는다.
CREATE TABLE IF NOT EXISTS tech_daily_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,                                   -- 'YYYY-MM-DD' (시트 이름의 날짜)
  part TEXT NOT NULL CHECK (part IN ('SSD','Module')),
  category TEXT,                                               -- SSD: Team / Module: 구분
  seq INTEGER,                                                 -- SSD: No (Module 시트에는 없음)
  title TEXT,                                                  -- SSD: 항목 / Module: 제목
  content TEXT,                                                -- 진행 사항 (개행 포함 원문 그대로)
  progress_note TEXT,                                          -- SSD: 진도 (Module 시트에는 없음)
  status TEXT,                                                 -- 원문 그대로 (한국어/베트남어 혼재)
  owner TEXT,                                                  -- SSD: 담당자 (Module 시트에는 없음)
  remark TEXT,                                                 -- Module: Remark
  created_by INTEGER REFERENCES techops_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_daily_report_date ON tech_daily_report(report_date, part);
CREATE INDEX IF NOT EXISTS idx_tech_daily_report_part ON tech_daily_report(part);

-- SSD/Module 업무 항목: 한 번 등록하면 계속 남아있고, 날짜별 진행 상황은
-- tech_daily_update 에 계속 추가한다 (tech_task/tech_update 와 동일한 패턴).
-- 엑셀에서 매일 같은 항목을 새로 베껴 쓰던 방식을 대체하기 위한 구조.
CREATE TABLE IF NOT EXISTS tech_daily_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part TEXT NOT NULL CHECK (part IN ('SSD','Module')),
  category TEXT,
  title TEXT NOT NULL,
  owner TEXT,
  created_by INTEGER REFERENCES techops_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tech_daily_item_part ON tech_daily_item(part);

-- 업데이트 자체는 날짜/작성자만 갖고, 실제 입력값은 아래 tech_daily_field 로 정의된
-- 필드들을 tech_daily_update_value 에 EAV 형태로 담는다. 필드 구성을 관리자가
-- /daily-fields 화면에서 자유롭게 추가/삭제/변경할 수 있게 하기 위함 — 필드가 고정된
-- 컬럼이면 새 필드를 추가할 때마다 코드/배포가 필요해지므로 이 구조를 택함.
CREATE TABLE IF NOT EXISTS tech_daily_update (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES tech_daily_item(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  author_id INTEGER REFERENCES techops_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_daily_update_item ON tech_daily_update(item_id);
CREATE INDEX IF NOT EXISTS idx_tech_daily_update_date ON tech_daily_update(report_date);

-- 일일보고 입력 폼의 필드 정의 (관리자가 /daily-fields 에서 관리, 코드 수정 없이 반영됨)
-- depends_on_field_id 가 있으면 "상위 항목" 역할을 하는 다른 select 필드를 가리킨다 —
-- 그 상위 필드에서 고른 값에 따라 이 필드의 드롭다운 선택지가 걸러진다(계층형 드롭다운).
-- 항상 나중에 만들어진 필드만 depends_on_field_id 를 가질 수 있으므로(= 상위 필드는 이미
-- 존재하는 더 작은 sort_order 를 가짐) 순환 참조가 생기지 않는다.
-- label 은 필수(=관리자가 항상 입력하는 기본 이름, 보통 한국어)이고, label_en/label_vi 는
-- 선택 입력 — 비어 있으면 화면 언어가 en/vi 여도 label 을 그대로 보여준다(worker.js 의
-- resolveFieldLabel). 이 필드는 tech_task 같은 고정 화면 문구(I18N)와 달리 관리자가 그때그때
-- 자유롭게 짓는 이름이라 I18N 객체로는 다국어 처리를 할 수 없어서 이렇게 별도 컬럼을 둠.
CREATE TABLE IF NOT EXISTS tech_daily_field (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  label_en TEXT,
  label_vi TEXT,
  input_type TEXT NOT NULL DEFAULT 'text' CHECK (input_type IN ('text','textarea','select')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  depends_on_field_id INTEGER REFERENCES tech_daily_field(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- input_type='select' 인 필드의 선택지 목록.
-- parent_option_id 는 이 필드가 depends_on_field_id 를 가질 때만 쓰이며, 상위 필드의
-- 어떤 선택지 아래에 속하는지를 가리킨다(상위 선택지가 삭제되면 그 아래 선택지도 함께 삭제).
CREATE TABLE IF NOT EXISTS tech_daily_field_option (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_id INTEGER NOT NULL REFERENCES tech_daily_field(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  parent_option_id INTEGER REFERENCES tech_daily_field_option(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tech_daily_field_option_field ON tech_daily_field_option(field_id);
CREATE INDEX IF NOT EXISTS idx_tech_daily_field_option_parent ON tech_daily_field_option(parent_option_id);

-- value 는 원문(작성자가 실제로 입력한 언어, 대부분 베트남어 또는 한국어) 또는 그
-- 자동번역 결과 중 "ko" 슬롯을 담고, value_en/value_vi 는 나머지 두 언어 번역을 담는다
-- (tech_daily_field.label/label_en/label_vi 와 완전히 같은 패턴). 일반 select 필드는
-- 저장값 호환성을 위해 세 칸에 원문을 복사한다. 표준 상태 필드는 언어 중립 영문 코드를
-- 세 칸 모두에 저장하고 DAILY_STATUS_LABELS로 표시한다. 그 밖의 선택지는 수동 검수된
-- STANDARD_OPTION_LABELS 또는 tech_translation_cache로 표시한다. 자유 텍스트는 저장 시
-- resolveTrilingualText()로 번역된다.
CREATE TABLE IF NOT EXISTS tech_daily_update_value (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  update_id INTEGER NOT NULL REFERENCES tech_daily_update(id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES tech_daily_field(id) ON DELETE CASCADE,
  value TEXT,
  value_en TEXT,
  value_vi TEXT,
  UNIQUE(update_id, field_id)
);
CREATE INDEX IF NOT EXISTS idx_tech_daily_update_value_update ON tech_daily_update_value(update_id);

-- 사용자 입력 원문을 화면 언어(ko/en/vi)에 맞춰 재사용하기 위한 공용 번역 캐시.
-- 업무 제목/설명, 진행 내용, 일일업무 제목, 사용자 정의 드롭다운 선택지와 과거
-- 엑셀 아카이브처럼 각 원본 테이블에 번역 컬럼이 없는 텍스트도 같은 규칙으로 표시한다.
CREATE TABLE IF NOT EXISTS tech_translation_cache (
  source_text TEXT PRIMARY KEY,
  source_lang TEXT NOT NULL CHECK (source_lang IN ('ko','en','vi')),
  value_ko TEXT,
  value_en TEXT,
  value_vi TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 제조기술 일일보고 표준 필드. 엔지니어/통역은 베트남어 UI에서 입력하고 관리자는 같은
-- 데이터를 한국어로 조회한다. 이미 존재하는 필드는 건너뛰므로 운영 DB에도 재실행 가능하다.
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '제품', 'Product', 'Sản phẩm', 'select', 10 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '제품');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '업무구분', 'Work Category', 'Phân loại công việc', 'select', 20 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '업무구분');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '작업내용', 'Work Details', 'Nội dung công việc', 'textarea', 30 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '작업내용');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '진행중인 공정', 'Current Process', 'Công đoạn đang thực hiện', 'text', 40 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '진행중인 공정');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '파트넘버', 'Part Number', 'Mã linh kiện', 'text', 50 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '파트넘버');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '랏넘버', 'Lot Number', 'Số lot', 'text', 60 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '랏넘버');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '수량', 'Quantity', 'Số lượng', 'text', 70 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '수량');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '양품 수량', 'Good Quantity', 'Số lượng đạt', 'text', 80 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '양품 수량');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '불량 수량', 'Defect Quantity', 'Số lượng lỗi', 'text', 90 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '불량 수량');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '수율', 'Yield', 'Tỷ lệ đạt', 'text', 100 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '수율');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '진행률', 'Progress', 'Tiến độ', 'text', 110 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '진행률');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '상태', 'Status', 'Trạng thái', 'select', 120 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '상태');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '이슈/조치내용', 'Issue / Action', 'Sự cố / Biện pháp', 'textarea', 130 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '이슈/조치내용');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '다음 계획', 'Next Plan', 'Kế hoạch tiếp theo', 'textarea', 140 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '다음 계획');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
  SELECT '비고', 'Remark', 'Ghi chú', 'textarea', 150 WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label = '비고');

-- 업무구분은 기존 한국어 기준값을 유지하지만, 상태는 언어와 무관한 영문 코드를 DB
-- 기준값으로 저장하고 worker.js에서 화면 언어에 맞게 표시한다.
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, '평가', 10 FROM tech_daily_field f WHERE f.label = '업무구분'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = '평가');
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, '불량분석', 20 FROM tech_daily_field f WHERE f.label = '업무구분'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = '불량분석');
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, '이슈대응', 30 FROM tech_daily_field f WHERE f.label = '업무구분'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = '이슈대응');
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, '설비점검 모니터링', 40 FROM tech_daily_field f WHERE f.label = '업무구분'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = '설비점검 모니터링');

INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, 'WAITING', 10 FROM tech_daily_field f WHERE f.label = '상태'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = 'WAITING');
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, 'IN_PROGRESS', 20 FROM tech_daily_field f WHERE f.label = '상태'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = 'IN_PROGRESS');
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, 'DELAYED', 30 FROM tech_daily_field f WHERE f.label = '상태'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = 'DELAYED');
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, 'ISSUE', 40 FROM tech_daily_field f WHERE f.label = '상태'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = 'ISSUE');
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, 'ON_HOLD', 45 FROM tech_daily_field f WHERE f.label = '상태'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = 'ON_HOLD');
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
  SELECT id, 'COMPLETED', 50 FROM tech_daily_field f WHERE f.label = '상태'
    AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = 'COMPLETED');

CREATE TABLE IF NOT EXISTS tech_report_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type TEXT NOT NULL DEFAULT 'weekly',
  period_start TEXT,
  period_end TEXT,
  content TEXT,
  generated_by INTEGER REFERENCES techops_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 기준정보(Master Data) 모듈 (2026-09-05 추가)
-- 일일업무(tech_daily_*)는 EAV이지만, 기준정보는 언어중립 코드값을
-- 행 단위로 표에 뿌려보는 용도가 대부분이고 규모도 작아(수백 건)
-- 행당 JSON(data_json) 구조를 쓴다. 의도된 차이이며 통일 대상 아님.
-- ============================================================

CREATE TABLE IF NOT EXISTS tech_master_set (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT    NOT NULL UNIQUE,
  name_ko           TEXT    NOT NULL,
  name_en           TEXT    NOT NULL,
  name_vi           TEXT    NOT NULL,
  description       TEXT,
  owner_user_id     INTEGER,
  review_cycle_days INTEGER NOT NULL DEFAULT 90,
  last_verified_at  TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tech_master_field (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id       INTEGER NOT NULL REFERENCES tech_master_set(id) ON DELETE CASCADE,
  code         TEXT    NOT NULL,
  label_ko     TEXT    NOT NULL,
  label_en     TEXT    NOT NULL,
  label_vi     TEXT    NOT NULL,
  data_type    TEXT    NOT NULL DEFAULT 'TEXT'
               CHECK (data_type IN ('TEXT','NUMBER','SELECT','YN','DATE')),
  required     INTEGER NOT NULL DEFAULT 0,
  is_key       INTEGER NOT NULL DEFAULT 0,
  show_in_list INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  UNIQUE (set_id, code)
);

CREATE TABLE IF NOT EXISTS tech_master_row (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id        INTEGER NOT NULL REFERENCES tech_master_set(id) ON DELETE CASCADE,
  row_key       TEXT    NOT NULL,
  data_json     TEXT    NOT NULL DEFAULT '{}',
  verify_status TEXT    NOT NULL DEFAULT 'OK'
                CHECK (verify_status IN ('OK','CHECK','ERROR')),
  verify_note   TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_by    INTEGER,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by    INTEGER,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (set_id, row_key)
);
CREATE INDEX IF NOT EXISTS idx_master_row_set    ON tech_master_row(set_id, active);
CREATE INDEX IF NOT EXISTS idx_master_row_verify ON tech_master_row(set_id, verify_status);

CREATE TABLE IF NOT EXISTS tech_master_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id        INTEGER NOT NULL,
  row_id        INTEGER,
  row_key       TEXT,
  action        TEXT    NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','IMPORT')),
  field_code    TEXT,
  old_value     TEXT,
  new_value     TEXT,
  batch_id      TEXT,
  actor_user_id INTEGER,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_master_log_set   ON tech_master_log(set_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_log_batch ON tech_master_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_master_log_row   ON tech_master_log(row_id, created_at DESC);


-- ---------- 기준정보 종류 3건 ----------
INSERT OR IGNORE INTO tech_master_set (code,name_ko,name_en,name_vi,description,sort_order) VALUES
  ('SSD_PRODUCT','SSD 제품 마스터','SSD Product Master','Master sản phẩm SSD','SSD 완제품 기준정보 (모델/Density/Controller/NAND/PN)',1);
INSERT OR IGNORE INTO tech_master_set (code,name_ko,name_en,name_vi,description,sort_order) VALUES
  ('PROCESS_ID','PROCESS ID 마스터','Process ID Master','Master Process ID','모델별 ARTS / AGING PROCESS ID 기준정보',2);
INSERT OR IGNORE INTO tech_master_set (code,name_ko,name_en,name_vi,description,sort_order) VALUES
  ('DM_PRODUCT','DM 제품구분','DRAM Module Product Category','Phân loại sản phẩm DRAM Module','DRAM 모듈 기준 P/N별 제품구분 (Gen / IC Ver / Speed / Density)',3);

-- ---------- 컬럼 정의 ----------
INSERT OR IGNORE INTO tech_master_field
  (set_id,code,label_ko,label_en,label_vi,data_type,required,is_key,show_in_list,sort_order) VALUES
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'PROD_ID','제품ID','Product ID','Mã sản phẩm','TEXT',1,1,1,1),
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'RANK_NO','순위','Rank','Thứ tự','NUMBER',0,0,1,2),
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'SALES','Sales','Sales','Kênh bán','SELECT',1,0,1,3),
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'MODEL_NAME','MODEL NAME','Model Name','Tên model','TEXT',1,0,1,4),
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'DENSITY','DENSITY','Density','Dung lượng','SELECT',1,0,1,5),
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'CONTROLLER','Controller','Controller','Controller','SELECT',1,0,1,6),
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'NAND','NAND','NAND','NAND','TEXT',0,0,1,7),
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'MECH_SIZE','Mechanical Size','Mechanical Size','Kích thước','SELECT',0,0,1,8),
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'SSD_PN','SSD PN','SSD P/N','SSD P/N','TEXT',1,0,1,9),
  ((SELECT id FROM tech_master_set WHERE code='SSD_PRODUCT'),'SRC_ROW','원본 최초행','Source Row','Dòng gốc','NUMBER',0,0,0,10);
INSERT OR IGNORE INTO tech_master_field
  (set_id,code,label_ko,label_en,label_vi,data_type,required,is_key,show_in_list,sort_order) VALUES
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'PIDM_ID','PROCESS MASTER ID','Process Master ID','Mã Process Master','TEXT',1,1,1,1),
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'SEQ_NO','No.','No.','Số TT','NUMBER',0,0,1,2),
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'SALES','Sales','Sales','Kênh bán','SELECT',1,0,1,3),
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'MODEL_NAME','MODEL NAME','Model Name','Tên model','TEXT',1,0,1,4),
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'PART_NO','PART NO (12DIGIT)','Part No (12 digit)','Part No (12 số)','TEXT',1,0,1,5),
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'CTRL','CTRL','Controller','Controller','SELECT',1,0,1,6),
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'FF','F/F','Form Factor','Form Factor','SELECT',1,0,1,7),
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'ARTS_PROCESS_ID','ARTS PROCESS ID','ARTS Process ID','ARTS Process ID','TEXT',0,0,1,8),
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'AGING_PROCESS_ID','AGING PROCESS ID','Aging Process ID','Aging Process ID','TEXT',1,0,1,9),
  ((SELECT id FROM tech_master_set WHERE code='PROCESS_ID'),'SRC_ROW','원본 ROW','Source Row','Dòng gốc','NUMBER',0,0,0,10);
INSERT OR IGNORE INTO tech_master_field
  (set_id,code,label_ko,label_en,label_vi,data_type,required,is_key,show_in_list,sort_order) VALUES
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'BASE_PN','기준 P/N','Base P/N','P/N chuẩn','TEXT',1,1,1,1),
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'MDL_INFO','MDL Info','MDL Info','MDL Info','SELECT',1,0,1,2),
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'GEN','Gen.','Generation','Thế hệ','SELECT',0,0,1,3),
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'IC_VER','IC Ver.','IC Version','Phiên bản IC','SELECT',0,0,1,4),
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'SPEED','Speed','Speed','Tốc độ','SELECT',0,0,1,5),
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'PRDT_DVN_FULL','PRDT_DVN_FULL','PRDT_DVN_FULL','PRDT_DVN_FULL','TEXT',0,0,1,6),
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'PRDT_DVN','PRDT_DVN','PRDT_DVN','PRDT_DVN','TEXT',0,0,1,7),
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'DENSITY','Density','Density','Dung lượng','SELECT',0,0,1,8),
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'RANK_ORG','Rank × Organization','Rank x Organization','Rank x Organization','SELECT',0,0,1,9),
  ((SELECT id FROM tech_master_set WHERE code='DM_PRODUCT'),'PACKAGE','Package','Package','Package','SELECT',0,0,0,10);

-- LOT INFO import storage
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
