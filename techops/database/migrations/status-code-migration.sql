-- 일일업무 STATUS 기준값을 언어와 무관한 영문 코드로 통일한다.
-- worker.js의 DAILY_STATUS_LABELS가 화면 언어별 표시명을 담당한다.
-- 운영 DB에 재실행해도 같은 결과가 유지되는 멱등형 마이그레이션이다.

UPDATE tech_daily_update_value
   SET value = CASE value
     WHEN '대기' THEN 'WAITING'
     WHEN 'Waiting' THEN 'WAITING'
     WHEN 'Chờ xử lý' THEN 'WAITING'
     WHEN '진행중' THEN 'IN_PROGRESS'
     WHEN 'In Progress' THEN 'IN_PROGRESS'
     WHEN 'Đang tiến hành' THEN 'IN_PROGRESS'
     WHEN '지연' THEN 'DELAYED'
     WHEN 'Delayed' THEN 'DELAYED'
     WHEN 'Chậm tiến độ' THEN 'DELAYED'
     WHEN '이슈' THEN 'ISSUE'
     WHEN 'Issue' THEN 'ISSUE'
     WHEN 'Có sự cố' THEN 'ISSUE'
     WHEN 'NG' THEN 'ISSUE'
     WHEN '보류' THEN 'ON_HOLD'
     WHEN 'On Hold' THEN 'ON_HOLD'
     WHEN 'Tạm hoãn' THEN 'ON_HOLD'
     WHEN 'Tạm dừng' THEN 'ON_HOLD'
     WHEN '완료' THEN 'COMPLETED'
     WHEN 'Completed' THEN 'COMPLETED'
     WHEN 'Done' THEN 'COMPLETED'
     WHEN 'Hoàn thành' THEN 'COMPLETED'
     ELSE value
   END,
       value_en = CASE value
     WHEN '대기' THEN 'WAITING' WHEN 'Waiting' THEN 'WAITING' WHEN 'Chờ xử lý' THEN 'WAITING'
     WHEN '진행중' THEN 'IN_PROGRESS' WHEN 'In Progress' THEN 'IN_PROGRESS' WHEN 'Đang tiến hành' THEN 'IN_PROGRESS'
     WHEN '지연' THEN 'DELAYED' WHEN 'Delayed' THEN 'DELAYED' WHEN 'Chậm tiến độ' THEN 'DELAYED'
     WHEN '이슈' THEN 'ISSUE' WHEN 'Issue' THEN 'ISSUE' WHEN 'Có sự cố' THEN 'ISSUE' WHEN 'NG' THEN 'ISSUE'
     WHEN '보류' THEN 'ON_HOLD' WHEN 'On Hold' THEN 'ON_HOLD' WHEN 'Tạm hoãn' THEN 'ON_HOLD' WHEN 'Tạm dừng' THEN 'ON_HOLD'
     WHEN '완료' THEN 'COMPLETED' WHEN 'Completed' THEN 'COMPLETED' WHEN 'Done' THEN 'COMPLETED' WHEN 'Hoàn thành' THEN 'COMPLETED'
     ELSE value
   END,
       value_vi = CASE value
     WHEN '대기' THEN 'WAITING' WHEN 'Waiting' THEN 'WAITING' WHEN 'Chờ xử lý' THEN 'WAITING'
     WHEN '진행중' THEN 'IN_PROGRESS' WHEN 'In Progress' THEN 'IN_PROGRESS' WHEN 'Đang tiến hành' THEN 'IN_PROGRESS'
     WHEN '지연' THEN 'DELAYED' WHEN 'Delayed' THEN 'DELAYED' WHEN 'Chậm tiến độ' THEN 'DELAYED'
     WHEN '이슈' THEN 'ISSUE' WHEN 'Issue' THEN 'ISSUE' WHEN 'Có sự cố' THEN 'ISSUE' WHEN 'NG' THEN 'ISSUE'
     WHEN '보류' THEN 'ON_HOLD' WHEN 'On Hold' THEN 'ON_HOLD' WHEN 'Tạm hoãn' THEN 'ON_HOLD' WHEN 'Tạm dừng' THEN 'ON_HOLD'
     WHEN '완료' THEN 'COMPLETED' WHEN 'Completed' THEN 'COMPLETED' WHEN 'Done' THEN 'COMPLETED' WHEN 'Hoàn thành' THEN 'COMPLETED'
     ELSE value
   END
 WHERE field_id IN (SELECT id FROM tech_daily_field WHERE label = '상태')
   AND value IN (
     '대기','Waiting','Chờ xử lý','진행중','In Progress','Đang tiến hành',
     '지연','Delayed','Chậm tiến độ','이슈','Issue','Có sự cố','NG',
     '보류','On Hold','Tạm hoãn','Tạm dừng','완료','Completed','Done','Hoàn thành'
   );

-- 이미 코드로 저장된 행도 번역 슬롯까지 코드로 맞춰 원본 혼용을 없앤다.
UPDATE tech_daily_update_value
   SET value_en = value, value_vi = value
 WHERE field_id IN (SELECT id FROM tech_daily_field WHERE label = '상태')
   AND value IN ('WAITING','IN_PROGRESS','DELAYED','ISSUE','ON_HOLD','COMPLETED');

UPDATE tech_daily_field_option SET value='WAITING'
 WHERE field_id IN (SELECT id FROM tech_daily_field WHERE label='상태')
   AND value IN ('대기','Waiting','Chờ xử lý');
UPDATE tech_daily_field_option SET value='IN_PROGRESS'
 WHERE field_id IN (SELECT id FROM tech_daily_field WHERE label='상태')
   AND value IN ('진행중','In Progress','Đang tiến hành');
UPDATE tech_daily_field_option SET value='DELAYED'
 WHERE field_id IN (SELECT id FROM tech_daily_field WHERE label='상태')
   AND value IN ('지연','Delayed','Chậm tiến độ');
UPDATE tech_daily_field_option SET value='ISSUE'
 WHERE field_id IN (SELECT id FROM tech_daily_field WHERE label='상태')
   AND value IN ('이슈','Issue','Có sự cố','NG');
UPDATE tech_daily_field_option SET value='ON_HOLD'
 WHERE field_id IN (SELECT id FROM tech_daily_field WHERE label='상태')
   AND value IN ('보류','On Hold','Tạm hoãn','Tạm dừng');
UPDATE tech_daily_field_option SET value='COMPLETED'
 WHERE field_id IN (SELECT id FROM tech_daily_field WHERE label='상태')
   AND value IN ('완료','Completed','Done','Hoàn thành');

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
