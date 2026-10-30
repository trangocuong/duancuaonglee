-- MDL_SSD_통합관리기준.xlsx 기반 일일보고 설정.
-- 기존 업무 항목(tech_daily_item)은 유지하고 보고 이력과 입력 필드만 한 번 초기화한다.
CREATE TABLE IF NOT EXISTS tech_migration_log (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

DELETE FROM tech_daily_update
 WHERE NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');
DELETE FROM tech_daily_report
 WHERE NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');
DELETE FROM tech_daily_field
 WHERE NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');

INSERT INTO tech_daily_field(label,label_en,label_vi,input_type,sort_order)
SELECT column1,column2,column3,column4,column5 FROM (VALUES
  ('소속부서','Department','Bộ phận','select',10),
  ('업무구분','Work Category','Phân loại công việc','select',20),
  ('업무유형','Work Type','Loại công việc','select',30),
  ('중분류','Subcategory','Phân loại phụ','select',40),
  ('소분류','Detail Category','Phân loại chi tiết','select',50),
  ('추가입력','Additional Input','Thông tin bổ sung','text',60),
  ('파트넘버','Part Number','Mã linh kiện','textarea',70),
  ('LOT Status','LOT Status','Trạng thái LOT','select',80),
  ('랏넘버','Lot Number','Số lot','textarea',90),
  ('작업내용','Work Details','Nội dung công việc','textarea',100),
  ('진행중인 공정','Current Process','Công đoạn đang thực hiện','text',110),
  ('수량','Quantity','Số lượng','text',120),
  ('양품 수량','Good Quantity','Số lượng đạt','text',130),
  ('불량 수량','Defect Quantity','Số lượng lỗi','text',140),
  ('수율','Yield','Tỷ lệ đạt','text',150),
  ('진행률','Progress','Tiến độ','text',160),
  ('상태','Status','Trạng thái','select',170),
  ('이슈/조치내용','Issue / Action','Sự cố / Biện pháp','textarea',180),
  ('다음 계획','Next Plan','Kế hoạch tiếp theo','textarea',190),
  ('비고','Remark','Ghi chú','textarea',200)
)
WHERE NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');

INSERT INTO tech_daily_field_option(field_id,value,sort_order)
SELECT f.id,v.column1,v.column2 FROM tech_daily_field f CROSS JOIN (VALUES ('SSD',10),('Module',20)) v
WHERE f.label='소속부서' AND NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');
INSERT INTO tech_daily_field_option(field_id,value,sort_order)
SELECT f.id,v.column1,v.column2 FROM tech_daily_field f CROSS JOIN (VALUES ('평가',10),('분석',20),('이슈',30),('과제',40)) v
WHERE f.label='업무구분' AND NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');
INSERT INTO tech_daily_field_option(field_id,value,sort_order)
SELECT f.id,v.column1,v.column2 FROM tech_daily_field f CROSS JOIN (VALUES
 ('PGM 평가',10),('기타 평가',20),('부적합 승인평가',30),('설비 평가',40),('신제품 평가',50),('자재 평가',60),
 ('고객 클레임',70),('생산라인 이슈',80),('OCAP 불량 분석',90),('저수율 불량 분석',100),('KPI 성능지표 개선과제',110)
) v WHERE f.label='업무유형' AND NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');
INSERT INTO tech_daily_field_option(field_id,value,sort_order)
SELECT f.id,v.column1,v.column2 FROM tech_daily_field f CROSS JOIN (VALUES
 ('PGM/EVAL',10),('DOE',20),('시양산',30),('PFQ',40),('PFQ/PRQ',50),('세부 내용 직접입력',60),('Interface',70),
 ('ARTs',80),('Aging',90),('OMS 등록번호',100),('자동화 시스템',110),('공정',120),('TAT',130),('Analysis',140),
 ('Qual',150),('SPD gate',160),('PCT',170),('ATE',180),('PCT Prime',190),('ATE Prime',200)
) v WHERE f.label='중분류' AND NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');
INSERT INTO tech_daily_field_option(field_id,value,sort_order)
SELECT f.id,v.column1,v.column2 FROM tech_daily_field f CROSS JOIN (VALUES
 ('신규 설비',10),('설비 위치 이동',20),('PGM',30),('PRODUCT',40),('EQP',50),('SYSTEM',60),('세부 내용 직접입력',70)
) v WHERE f.label='소분류' AND NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');
INSERT INTO tech_daily_field_option(field_id,value,sort_order)
SELECT f.id,v.column1,v.column2 FROM tech_daily_field f CROSS JOIN (VALUES ('LOT_TRACER',10),('SWP_EXCEL_IMPORT',20)) v
WHERE f.label='LOT Status' AND NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');
INSERT INTO tech_daily_field_option(field_id,value,sort_order)
SELECT f.id,v.column1,v.column2 FROM tech_daily_field f CROSS JOIN (VALUES
 ('WAITING',10),('IN_PROGRESS',20),('DELAYED',30),('RESTRICTED',40),('COMPLETED',50),('PLANNED',60),
 ('APPROVAL_PENDING',70),('REWORK',80),('UNDER_REVIEW',90),('ISSUE',100),('QA_HANDOFF',110)
) v WHERE f.label='상태' AND NOT EXISTS (SELECT 1 FROM tech_migration_log WHERE name='daily-report-settings-20260914');

INSERT OR IGNORE INTO tech_migration_log(name) VALUES ('daily-report-settings-20260914');
