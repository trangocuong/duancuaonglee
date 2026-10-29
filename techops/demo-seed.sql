-- 제조기술 일일보고 V2 데모 데이터
-- 사용법: npx wrangler d1 execute techops-db --remote --file=demo-seed.sql
-- 같은 날 다시 실행해도 동일 항목/업데이트/필드값은 중복 생성되지 않는다.

WITH products(value, sort_order) AS (
  VALUES ('NVMe SSD 512GB', 10), ('SATA SSD 1TB', 20), ('DDR5 16GB Module', 30), ('DDR5 32GB Module', 40)
)
INSERT INTO tech_daily_field_option (field_id, value, sort_order)
SELECT f.id, p.value, p.sort_order
  FROM products p JOIN tech_daily_field f ON f.label = '제품'
 WHERE NOT EXISTS (
   SELECT 1 FROM tech_daily_field_option o WHERE o.field_id = f.id AND o.value = p.value
 );

INSERT INTO tech_daily_item (part, category, title, owner, created_by)
SELECT 'SSD', '평가', 'NVMe 512GB 신뢰성 평가', 'Nguyễn Minh', (SELECT id FROM techops_users ORDER BY role = 'admin' DESC, id LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_item WHERE title = 'NVMe 512GB 신뢰성 평가');

INSERT INTO tech_daily_item (part, category, title, owner, created_by)
SELECT 'SSD', '불량분석', 'SATA SSD Read Fail 불량 분석', 'Trần Hải', (SELECT id FROM techops_users ORDER BY role = 'admin' DESC, id LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_item WHERE title = 'SATA SSD Read Fail 불량 분석');

INSERT INTO tech_daily_item (part, category, title, owner, created_by)
SELECT 'Module', '이슈대응', 'DDR5 16GB 고객 부팅 이슈 대응', 'Lê Anh', (SELECT id FROM techops_users ORDER BY role = 'admin' DESC, id LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_item WHERE title = 'DDR5 16GB 고객 부팅 이슈 대응');

INSERT INTO tech_daily_item (part, category, title, owner, created_by)
SELECT 'Module', '설비점검 모니터링', 'Module ATE 정기점검', 'Phạm Quang', (SELECT id FROM techops_users ORDER BY role = 'admin' DESC, id LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM tech_daily_item WHERE title = 'Module ATE 정기점검');

INSERT INTO tech_daily_update (item_id, report_date, author_id)
SELECT i.id, date('now', '-1 day'), (SELECT id FROM techops_users ORDER BY role = 'admin' DESC, id LIMIT 1)
  FROM tech_daily_item i
 WHERE i.title IN (
   'NVMe 512GB 신뢰성 평가',
   'SATA SSD Read Fail 불량 분석',
   'DDR5 16GB 고객 부팅 이슈 대응',
   'Module ATE 정기점검'
 )
   AND NOT EXISTS (
     SELECT 1 FROM tech_daily_update u WHERE u.item_id = i.id AND u.report_date = date('now', '-1 day')
   );

WITH demo_values(item_title, field_label, value_ko, value_en, value_vi) AS (
  VALUES
  ('NVMe 512GB 신뢰성 평가', '제품', 'NVMe SSD 512GB', 'NVMe SSD 512GB', 'NVMe SSD 512GB'),
  ('NVMe 512GB 신뢰성 평가', '업무구분', '평가', 'Evaluation', 'Đánh giá'),
  ('NVMe 512GB 신뢰성 평가', '작업내용', '고온 동작 수명시험 2차 샘플 측정을 완료했습니다.', 'Completed the second sample measurement for the high-temperature operating life test.', 'Đã hoàn thành đo mẫu lần 2 cho thử nghiệm tuổi thọ hoạt động ở nhiệt độ cao.'),
  ('NVMe 512GB 신뢰성 평가', '진행중인 공정', 'HTOL 1,000시간', 'HTOL 1,000 hours', 'HTOL 1.000 giờ'),
  ('NVMe 512GB 신뢰성 평가', '파트넘버', 'KTS-NV512-A1', 'KTS-NV512-A1', 'KTS-NV512-A1'),
  ('NVMe 512GB 신뢰성 평가', '랏넘버', 'VN260831-01', 'VN260831-01', 'VN260831-01'),
  ('NVMe 512GB 신뢰성 평가', '수량', '200', '200', '200'),
  ('NVMe 512GB 신뢰성 평가', '양품 수량', '197', '197', '197'),
  ('NVMe 512GB 신뢰성 평가', '불량 수량', '3', '3', '3'),
  ('NVMe 512GB 신뢰성 평가', '수율', '98.5%', '98.5%', '98.5%'),
  ('NVMe 512GB 신뢰성 평가', '진행률', '75%', '75%', '75%'),
  ('NVMe 512GB 신뢰성 평가', '상태', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS'),
  ('NVMe 512GB 신뢰성 평가', '이슈/조치내용', '', '', ''),
  ('NVMe 512GB 신뢰성 평가', '다음 계획', '잔여 250시간 시험 후 최종 데이터 검토 예정입니다.', 'Review final data after the remaining 250 test hours.', 'Sẽ xem xét dữ liệu cuối cùng sau 250 giờ thử nghiệm còn lại.'),
  ('NVMe 512GB 신뢰성 평가', '비고', '특이사항 없음', 'No abnormal findings', 'Không có bất thường'),

  ('SATA SSD Read Fail 불량 분석', '제품', 'SATA SSD 1TB', 'SATA SSD 1TB', 'SATA SSD 1TB'),
  ('SATA SSD Read Fail 불량 분석', '업무구분', '불량분석', 'Defect Analysis', 'Phân tích lỗi'),
  ('SATA SSD Read Fail 불량 분석', '작업내용', 'Read Fail 샘플의 NAND dump와 전원 파형을 비교 분석했습니다.', 'Compared NAND dumps and power waveforms of Read Fail samples.', 'Đã so sánh NAND dump và dạng sóng nguồn của mẫu Read Fail.'),
  ('SATA SSD Read Fail 불량 분석', '진행중인 공정', 'FA / NAND 분석', 'FA / NAND analysis', 'FA / Phân tích NAND'),
  ('SATA SSD Read Fail 불량 분석', '파트넘버', 'KTS-ST1T-B2', 'KTS-ST1T-B2', 'KTS-ST1T-B2'),
  ('SATA SSD Read Fail 불량 분석', '랏넘버', 'VN260830-07', 'VN260830-07', 'VN260830-07'),
  ('SATA SSD Read Fail 불량 분석', '수량', '80', '80', '80'),
  ('SATA SSD Read Fail 불량 분석', '양품 수량', '73', '73', '73'),
  ('SATA SSD Read Fail 불량 분석', '불량 수량', '7', '7', '7'),
  ('SATA SSD Read Fail 불량 분석', '수율', '91.3%', '91.3%', '91.3%'),
  ('SATA SSD Read Fail 불량 분석', '진행률', '60%', '60%', '60%'),
  ('SATA SSD Read Fail 불량 분석', '상태', 'ISSUE', 'ISSUE', 'ISSUE'),
  ('SATA SSD Read Fail 불량 분석', '이슈/조치내용', '7개 샘플에서 동일 FW 구간의 ECC 증가가 확인되었습니다. FW팀에 로그와 재현 조건을 전달했습니다.', 'ECC increase was found in the same firmware section on seven samples. Logs and reproduction conditions were sent to the firmware team.', 'Đã xác nhận ECC tăng tại cùng khu vực FW trên 7 mẫu. Đã gửi log và điều kiện tái hiện cho nhóm FW.'),
  ('SATA SSD Read Fail 불량 분석', '다음 계획', 'FW 수정본 수령 후 80개 재검증 예정입니다.', 'Revalidate 80 units after receiving the firmware fix.', 'Sẽ kiểm tra lại 80 sản phẩm sau khi nhận bản FW sửa.'),
  ('SATA SSD Read Fail 불량 분석', '비고', '임원 보고 대상', 'Executive attention required', 'Cần báo cáo quản lý'),

  ('DDR5 16GB 고객 부팅 이슈 대응', '제품', 'DDR5 16GB Module', 'DDR5 16GB Module', 'DDR5 16GB Module'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '업무구분', '이슈대응', 'Issue Response', 'Xử lý sự cố'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '작업내용', '고객 시스템 BIOS 버전별 부팅 재현시험을 진행했습니다.', 'Ran boot reproduction tests by customer BIOS version.', 'Đã thử tái hiện lỗi khởi động theo từng phiên bản BIOS của khách hàng.'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '진행중인 공정', 'System Compatibility', 'System Compatibility', 'Tương thích hệ thống'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '파트넘버', 'KTM-D5-16-C3', 'KTM-D5-16-C3', 'KTM-D5-16-C3'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '랏넘버', 'MDL260829-03', 'MDL260829-03', 'MDL260829-03'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '수량', '120', '120', '120'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '양품 수량', '118', '118', '118'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '불량 수량', '2', '2', '2'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '수율', '98.3%', '98.3%', '98.3%'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '진행률', '50%', '50%', '50%'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '상태', 'DELAYED', 'DELAYED', 'DELAYED'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '이슈/조치내용', '고객 BIOS 원본 확보가 지연되어 원인 확정이 하루 늦어졌습니다. 고객 기술창구에 재요청했습니다.', 'Root-cause confirmation is delayed by one day because the original customer BIOS has not arrived. It was requested again.', 'Việc xác nhận nguyên nhân chậm 1 ngày do chưa nhận được BIOS gốc của khách hàng. Đã yêu cầu lại đầu mối kỹ thuật.'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '다음 계획', 'BIOS 수령 즉시 3개 플랫폼 교차시험을 실시합니다.', 'Run cross-tests on three platforms immediately after receiving the BIOS.', 'Ngay khi nhận BIOS sẽ thử chéo trên 3 nền tảng.'),
  ('DDR5 16GB 고객 부팅 이슈 대응', '비고', '고객 회신 필요', 'Customer response required', 'Cần phản hồi từ khách hàng'),

  ('Module ATE 정기점검', '제품', 'DDR5 32GB Module', 'DDR5 32GB Module', 'DDR5 32GB Module'),
  ('Module ATE 정기점검', '업무구분', '설비점검 모니터링', 'Equipment Inspection / Monitoring', 'Kiểm tra / Giám sát thiết bị'),
  ('Module ATE 정기점검', '작업내용', 'ATE #03 접점 저항과 Golden Sample 반복성을 점검했습니다.', 'Checked contact resistance and Golden Sample repeatability on ATE #03.', 'Đã kiểm tra điện trở tiếp xúc và độ lặp lại Golden Sample của ATE #03.'),
  ('Module ATE 정기점검', '진행중인 공정', 'ATE PM', 'ATE PM', 'Bảo dưỡng ATE'),
  ('Module ATE 정기점검', '파트넘버', 'KTM-D5-32-D4', 'KTM-D5-32-D4', 'KTM-D5-32-D4'),
  ('Module ATE 정기점검', '랏넘버', 'PM-ATE03-260831', 'PM-ATE03-260831', 'PM-ATE03-260831'),
  ('Module ATE 정기점검', '수량', '50', '50', '50'),
  ('Module ATE 정기점검', '양품 수량', '50', '50', '50'),
  ('Module ATE 정기점검', '불량 수량', '0', '0', '0'),
  ('Module ATE 정기점검', '수율', '100%', '100%', '100%'),
  ('Module ATE 정기점검', '진행률', '100%', '100%', '100%'),
  ('Module ATE 정기점검', '상태', 'COMPLETED', 'COMPLETED', 'COMPLETED'),
  ('Module ATE 정기점검', '이슈/조치내용', '', '', ''),
  ('Module ATE 정기점검', '다음 계획', '다음 주 ATE #04 정기점검 예정입니다.', 'ATE #04 preventive maintenance is planned next week.', 'Dự kiến bảo dưỡng định kỳ ATE #04 vào tuần tới.'),
  ('Module ATE 정기점검', '비고', '점검 기준 만족', 'Inspection criteria met', 'Đạt tiêu chuẩn kiểm tra')
)
INSERT OR IGNORE INTO tech_daily_update_value (update_id, field_id, value, value_en, value_vi)
SELECT u.id, f.id, d.value_ko, d.value_en, d.value_vi
  FROM demo_values d
  JOIN tech_daily_item i ON i.title = d.item_title
  JOIN tech_daily_update u ON u.item_id = i.id AND u.report_date = date('now', '-1 day')
  JOIN tech_daily_field f ON f.label = d.field_label;
