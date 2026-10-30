-- 운영 DB의 기존 일일보고 값을 보존하면서 V2 표준 입력 필드로 전환한다.
-- 재실행 가능하도록 모든 추가 작업은 label/value 존재 여부를 확인한다.
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
SELECT '제품', 'Product', 'Sản phẩm', 'text', 20
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label='제품');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
SELECT '작업내용', 'Work Details', 'Nội dung công việc', 'textarea', 40
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label='작업내용');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
SELECT '양품 수량', 'Good Quantity', 'Số lượng đạt', 'text', 90
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label='양품 수량');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
SELECT '불량 수량', 'Defect Quantity', 'Số lượng lỗi', 'text', 100
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label='불량 수량');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
SELECT '진행률', 'Progress', 'Tiến độ', 'text', 120
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label='진행률');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
SELECT '이슈/조치내용', 'Issue / Action', 'Sự cố / Biện pháp', 'textarea', 140
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label='이슈/조치내용');
INSERT INTO tech_daily_field (label, label_en, label_vi, input_type, sort_order)
SELECT '다음 계획', 'Next Plan', 'Kế hoạch tiếp theo', 'textarea', 150
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_field WHERE label='다음 계획');

-- 기존 "양품/불량 수량"의 94/2 형식 값을 두 표준 필드로 이관한다.
INSERT OR IGNORE INTO tech_daily_update_value (update_id, field_id, value, value_en, value_vi)
SELECT v.update_id, target.id,
       trim(substr(v.value, 1, instr(v.value, '/') - 1)),
       trim(substr(v.value, 1, instr(v.value, '/') - 1)),
       trim(substr(v.value, 1, instr(v.value, '/') - 1))
FROM tech_daily_update_value v
JOIN tech_daily_field source ON source.id=v.field_id AND source.label='양품/불량 수량'
JOIN tech_daily_field target ON target.label='양품 수량'
WHERE instr(v.value, '/') > 0;

INSERT OR IGNORE INTO tech_daily_update_value (update_id, field_id, value, value_en, value_vi)
SELECT v.update_id, target.id,
       trim(substr(v.value, instr(v.value, '/') + 1)),
       trim(substr(v.value, instr(v.value, '/') + 1)),
       trim(substr(v.value, instr(v.value, '/') + 1))
FROM tech_daily_update_value v
JOIN tech_daily_field source ON source.id=v.field_id AND source.label='양품/불량 수량'
JOIN tech_daily_field target ON target.label='불량 수량'
WHERE instr(v.value, '/') > 0;

DELETE FROM tech_daily_update_value
WHERE field_id IN (SELECT id FROM tech_daily_field WHERE label='양품/불량 수량')
  AND EXISTS (
    SELECT 1 FROM tech_daily_update_value good
    JOIN tech_daily_field good_field ON good_field.id=good.field_id AND good_field.label='양품 수량'
    WHERE good.update_id=tech_daily_update_value.update_id
  )
  AND EXISTS (
    SELECT 1 FROM tech_daily_update_value defect
    JOIN tech_daily_field defect_field ON defect_field.id=defect.field_id AND defect_field.label='불량 수량'
    WHERE defect.update_id=tech_daily_update_value.update_id
  );

DELETE FROM tech_daily_field
WHERE label='양품/불량 수량'
  AND NOT EXISTS (SELECT 1 FROM tech_daily_update_value WHERE field_id=tech_daily_field.id);

UPDATE tech_daily_field SET sort_order=10 WHERE label='소속';
UPDATE tech_daily_field SET sort_order=20 WHERE label='제품';
UPDATE tech_daily_field SET sort_order=30 WHERE label='업무구분';
UPDATE tech_daily_field SET sort_order=40 WHERE label='작업내용';
UPDATE tech_daily_field SET sort_order=50 WHERE label='진행중인 공정';
UPDATE tech_daily_field SET sort_order=60 WHERE label='파트넘버';
UPDATE tech_daily_field SET sort_order=70 WHERE label='랏넘버';
UPDATE tech_daily_field SET sort_order=80 WHERE label='수량';
UPDATE tech_daily_field SET sort_order=90 WHERE label='양품 수량';
UPDATE tech_daily_field SET sort_order=100 WHERE label='불량 수량';
UPDATE tech_daily_field SET sort_order=110 WHERE label='수율';
UPDATE tech_daily_field SET sort_order=120 WHERE label='진행률';
UPDATE tech_daily_field SET input_type='select', label_en='Status', label_vi='Trạng thái', sort_order=130 WHERE label='상태';
UPDATE tech_daily_field SET sort_order=140 WHERE label='이슈/조치내용';
UPDATE tech_daily_field SET sort_order=150 WHERE label='다음 계획';
UPDATE tech_daily_field SET sort_order=160 WHERE label='비고';

INSERT INTO tech_daily_field_option (field_id,value,sort_order)
SELECT id,'WAITING',10 FROM tech_daily_field f WHERE f.label='상태'
  AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value='WAITING');
INSERT INTO tech_daily_field_option (field_id,value,sort_order)
SELECT id,'IN_PROGRESS',20 FROM tech_daily_field f WHERE f.label='상태'
  AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value='IN_PROGRESS');
INSERT INTO tech_daily_field_option (field_id,value,sort_order)
SELECT id,'DELAYED',30 FROM tech_daily_field f WHERE f.label='상태'
  AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value='DELAYED');
INSERT INTO tech_daily_field_option (field_id,value,sort_order)
SELECT id,'ISSUE',40 FROM tech_daily_field f WHERE f.label='상태'
  AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value='ISSUE');
INSERT INTO tech_daily_field_option (field_id,value,sort_order)
SELECT id,'ON_HOLD',45 FROM tech_daily_field f WHERE f.label='상태'
  AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value='ON_HOLD');
INSERT INTO tech_daily_field_option (field_id,value,sort_order)
SELECT id,'COMPLETED',50 FROM tech_daily_field f WHERE f.label='상태'
  AND NOT EXISTS (SELECT 1 FROM tech_daily_field_option o WHERE o.field_id=f.id AND o.value='COMPLETED');
